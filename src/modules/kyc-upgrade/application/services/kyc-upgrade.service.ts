import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalEntityType, KycTier } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { MakerCheckerService } from '@modules/maker-checker/application/services/maker-checker.service';
import type { KycUpgradeApprovalPort } from '@modules/maker-checker/application/ports/kyc-upgrade-approval.port';
import { TraVerificationProvider } from '@modules/merchant-onboarding/application/ports/tra-verification.port';
import { TransactionLimitPolicyService } from '@modules/transaction-limits/application/services/transaction-limit-policy.service';
import {
  KycUpgradeRepository,
  KycUpgradeRequestWithRelations,
} from '../../infrastructure/persistence/kyc-upgrade.repository';

const ROLLING_WINDOW_DAYS = 30;

/** Only TIER_1's onboarding-free, lighter online-seller path is upgradeable here — see model doc comment for why. */
const NEXT_TIER: Partial<Record<KycTier, KycTier>> = {
  TIER_1: 'TIER_2',
};

export interface KycUpgradeStatusView {
  currentTier: KycTier;
  rollingVolume: number;
  tierThreshold: number;
  breached: boolean;
  activeRequest: KycUpgradeRequestWithRelations | null;
}

/**
 * Handoff §kycup. See KycUpgradeRequest's own doc comment in schema.prisma
 * for the scope boundary: the TIER_1 onboarding path itself is out of
 * scope without BOT sign-off; this service is the real upgrade mechanism
 * for whichever merchants land on TIER_1.
 */
@Injectable()
export class KycUpgradeService implements KycUpgradeApprovalPort {
  constructor(
    private readonly requests: KycUpgradeRepository,
    private readonly prisma: PrismaService,
    private readonly makerChecker: MakerCheckerService,
    private readonly audit: AuditLogService,
    private readonly tra: TraVerificationProvider,
    private readonly limits: TransactionLimitPolicyService,
  ) {}

  async getStatus(merchantId: string): Promise<KycUpgradeStatusView> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant)
      throw new NotFoundException(`Merchant ${merchantId} not found`);

    const since = new Date(Date.now() - ROLLING_WINDOW_DAYS * 24 * 3_600_000);
    const [{ _sum }, policy, activeRequest] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { merchantId, status: 'SUCCESS', receivedAt: { gte: since } },
        _sum: { amount: true },
      }),
      this.limits.getPolicy(merchant.kycTier),
      this.requests.findActiveForMerchant(merchantId),
    ]);

    const rollingVolume = Number(_sum.amount ?? 0);
    const tierThreshold = Number(policy.monthlyLimit);
    const breached =
      merchant.kycTier === 'TIER_1' && rollingVolume > tierThreshold;

    return {
      currentTier: merchant.kycTier,
      rollingVolume,
      tierThreshold,
      breached,
      activeRequest,
    };
  }

  async startUpgrade(
    acquirerId: string,
    merchantId: string,
    actorId: string,
  ): Promise<KycUpgradeRequestWithRelations> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant)
      throw new NotFoundException(`Merchant ${merchantId} not found`);

    const toTier = NEXT_TIER[merchant.kycTier];
    if (!toTier) {
      throw new ConflictException(
        `There is no defined upgrade path from ${merchant.kycTier}`,
      );
    }

    const existing = await this.requests.findActiveForMerchant(merchantId);
    if (existing) {
      throw new ConflictException(
        'This merchant already has a KYC upgrade request in progress',
      );
    }

    const request = await this.requests.create({
      acquirerId,
      merchantId,
      fromTier: merchant.kycTier,
      toTier,
      createdBy: actorId,
    });

    await this.audit.record({
      actorId,
      action: 'KYC_UPGRADE_STARTED',
      entityType: 'kyc_upgrade_request',
      entityId: request.id,
      metadata: { fromTier: merchant.kycTier, toTier },
    });

    return request;
  }

  async getById(id: string): Promise<KycUpgradeRequestWithRelations> {
    const request = await this.requests.findById(id);
    if (!request)
      throw new NotFoundException(`KYC upgrade request ${id} not found`);
    return request;
  }

  async verifyTin(
    id: string,
    actorId: string,
    tin: string,
  ): Promise<KycUpgradeRequestWithRelations> {
    const request = await this.getById(id);
    if (request.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Cannot verify TIN while the request is in status ${request.status}`,
      );
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: request.merchantId },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const outcome = await this.tra.verify({
      tin,
      expectedLegalName: merchant.legalName,
    });

    const updated = await this.requests.recordTinVerification(id, {
      tin,
      result: outcome.result,
      verifiedName: outcome.verifiedName,
    });

    await this.audit.record({
      actorId,
      action:
        outcome.result === 'MATCH'
          ? 'KYC_UPGRADE_TIN_VERIFIED'
          : 'KYC_UPGRADE_TIN_VERIFICATION_FAILED',
      entityType: 'kyc_upgrade_request',
      entityId: id,
      metadata: { tin, result: outcome.result },
    });

    if (outcome.result !== 'MATCH') {
      throw new BadRequestException(
        outcome.reason ?? `TIN verification result: ${outcome.result}`,
      );
    }

    return updated;
  }

  async addDocument(
    id: string,
    actorId: string,
    file: {
      docType: string;
      fileName: string;
      s3Bucket: string;
      s3Key: string;
      mimeType?: string;
      fileSize?: number;
    },
  ) {
    const request = await this.getById(id);
    if (request.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Cannot attach documents while the request is in status ${request.status}`,
      );
    }
    const document = await this.requests.addDocument({
      requestId: id,
      uploadedBy: actorId,
      ...file,
    });
    await this.audit.record({
      actorId,
      action: 'KYC_UPGRADE_DOCUMENT_ADDED',
      entityType: 'kyc_upgrade_request',
      entityId: id,
      metadata: { docType: file.docType, fileName: file.fileName },
    });
    return document;
  }

  /** Maker action — creates the real ApprovalTask a checker must decide on. */
  async submitForApproval(
    id: string,
    actorId: string,
  ): Promise<KycUpgradeRequestWithRelations> {
    const request = await this.getById(id);
    if (request.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Cannot submit while the request is in status ${request.status}`,
      );
    }
    if (request.tinVerificationResult !== 'MATCH') {
      throw new ConflictException(
        'TIN must be verified with a MATCH result before submitting for approval',
      );
    }
    if (request.documents.length === 0) {
      throw new ConflictException(
        'At least one business-registration document is required before submitting for approval',
      );
    }

    await this.makerChecker.createTask(
      request.acquirerId,
      ApprovalEntityType.KYC_TIER_UPGRADE,
      request.id,
      actorId,
    );
    const updated = await this.requests.updateStatus(
      id,
      'PENDING_CHECKER_APPROVAL',
    );
    await this.audit.record({
      actorId,
      action: 'KYC_UPGRADE_SUBMITTED',
      entityType: 'kyc_upgrade_request',
      entityId: id,
    });
    return updated;
  }

  // ── KycUpgradeApprovalPort — called back by ApproveTaskHandler/RejectTaskHandler ──

  async onCheckerApproved(requestId: string, checkerId: string): Promise<void> {
    const request = await this.getById(requestId);
    await this.prisma.merchant.update({
      where: { id: request.merchantId },
      data: { kycTier: request.toTier },
    });
    await this.requests.updateStatus(requestId, 'APPROVED', {
      decidedAt: new Date(),
    });
    await this.audit.record({
      actorId: checkerId,
      action: 'KYC_UPGRADE_APPROVED',
      entityType: 'kyc_upgrade_request',
      entityId: requestId,
      metadata: { toTier: request.toTier },
    });
  }

  async onCheckerRejected(
    requestId: string,
    checkerId: string,
    notes?: string,
  ): Promise<void> {
    await this.requests.updateStatus(requestId, 'REJECTED', {
      rejectionNotes: notes,
      decidedAt: new Date(),
    });
    await this.audit.record({
      actorId: checkerId,
      action: 'KYC_UPGRADE_REJECTED',
      entityType: 'kyc_upgrade_request',
      entityId: requestId,
      metadata: notes ? { notes } : undefined,
    });
  }
}
