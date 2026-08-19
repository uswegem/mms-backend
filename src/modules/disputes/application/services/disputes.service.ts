import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalEntityType, DisputeReason } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { MakerCheckerService } from '@modules/maker-checker/application/services/maker-checker.service';
import type { DisputeRefundApprovalPort } from '@modules/maker-checker/application/ports/dispute-refund-approval.port';
import {
  DisputesRepository,
  DisputeWithRelations,
} from '../../infrastructure/persistence/disputes.repository';

export interface CreateDisputeInput {
  merchantId: string;
  paymentId: string;
  raisedBy: 'MERCHANT' | 'PAYER' | 'LFB_OPS';
  reason: DisputeReason;
  description: string;
  disputedAmount: number;
}

/**
 * Handoff §disputes/§disputedet. The refund decision goes through the
 * same generic maker-checker task system as onboarding and
 * merchant-status changes (entityType DISPUTE_REFUND) — this service
 * implements DisputeRefundApprovalPort so ApproveTaskHandler/
 * RejectTaskHandler can call back into it once a checker decides.
 *
 * Deliberately does NOT move real money: approving a refund records the
 * decision (stage -> RESOLVED_REFUNDED) but there is no TIPS/CBS refund-
 * initiation integration in this codebase yet. That gap is the same
 * shape as every other "recommended enhancement beyond the BRS baseline"
 * called out elsewhere in this project — real here means "the decision
 * and its audit trail are real," not "money moves."
 */
@Injectable()
export class DisputesService implements DisputeRefundApprovalPort {
  constructor(
    private readonly disputes: DisputesRepository,
    private readonly prisma: PrismaService,
    private readonly makerChecker: MakerCheckerService,
    private readonly audit: AuditLogService,
  ) {}

  async create(
    acquirerId: string,
    actorId: string,
    input: CreateDisputeInput,
  ): Promise<DisputeWithRelations> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
    });
    if (!payment)
      throw new NotFoundException(`Payment ${input.paymentId} not found`);
    if (payment.merchantId !== input.merchantId) {
      throw new BadRequestException(
        'That payment does not belong to this merchant',
      );
    }
    if (payment.acquirerId !== acquirerId) {
      throw new NotFoundException(`Payment ${input.paymentId} not found`);
    }
    if (
      input.disputedAmount <= 0 ||
      input.disputedAmount > Number(payment.amount)
    ) {
      throw new BadRequestException(
        'Disputed amount must be greater than zero and not exceed the payment amount',
      );
    }

    const dispute = await this.disputes.create({
      acquirerId,
      merchantId: input.merchantId,
      paymentId: input.paymentId,
      raisedBy: input.raisedBy,
      reason: input.reason,
      description: input.description,
      disputedAmount: input.disputedAmount,
      createdBy: actorId,
    });

    // PaymentStatus.DISPUTED has existed in the schema with no writer
    // anywhere in this codebase — this is that writer.
    await this.prisma.payment.update({
      where: { id: input.paymentId },
      data: { status: 'DISPUTED' },
    });

    await this.audit.record({
      actorId,
      action: 'DISPUTE_LOGGED',
      entityType: 'dispute',
      entityId: dispute.id,
      metadata: {
        caseNo: dispute.caseNo,
        merchantId: input.merchantId,
        paymentId: input.paymentId,
      },
    });

    return dispute;
  }

  async getById(id: string): Promise<DisputeWithRelations> {
    const dispute = await this.disputes.findById(id);
    if (!dispute) throw new NotFoundException(`Dispute ${id} not found`);
    return dispute;
  }

  async list(
    acquirerId: string,
    merchantId?: string,
    stage?: DisputeWithRelations['stage'],
    page = 1,
    limit = 20,
  ) {
    return this.disputes.findMany(acquirerId, merchantId, stage, page, limit);
  }

  async addEvidence(
    id: string,
    actorId: string,
    file: {
      fileName: string;
      s3Bucket: string;
      s3Key: string;
      mimeType?: string;
      fileSize?: number;
    },
  ) {
    const dispute = await this.getById(id);
    if (
      ['RESOLVED_REFUNDED', 'RESOLVED_NO_REFUND', 'REJECTED'].includes(
        dispute.stage,
      )
    ) {
      throw new ConflictException(
        'This dispute is already resolved — no further evidence can be attached',
      );
    }
    const evidence = await this.disputes.addEvidence({
      disputeId: id,
      uploadedBy: actorId,
      ...file,
    });
    await this.audit.record({
      actorId,
      action: 'DISPUTE_EVIDENCE_ADDED',
      entityType: 'dispute',
      entityId: id,
      metadata: { fileName: file.fileName },
    });
    return evidence;
  }

  async requestEvidence(
    id: string,
    actorId: string,
  ): Promise<DisputeWithRelations> {
    const dispute = await this.getById(id);
    if (dispute.stage !== 'INVESTIGATION') {
      throw new ConflictException(
        `Cannot request evidence while the dispute is in stage ${dispute.stage}`,
      );
    }
    const updated = await this.disputes.updateStage(id, 'EVIDENCE_REQUESTED');
    await this.audit.record({
      actorId,
      action: 'DISPUTE_EVIDENCE_REQUESTED',
      entityType: 'dispute',
      entityId: id,
    });
    return updated;
  }

  /** Maker action — creates the real ApprovalTask a checker must decide on. */
  async initiateRefund(
    id: string,
    actorId: string,
  ): Promise<DisputeWithRelations> {
    const dispute = await this.getById(id);
    if (!['INVESTIGATION', 'EVIDENCE_REQUESTED'].includes(dispute.stage)) {
      throw new ConflictException(
        `Cannot initiate a refund while the dispute is in stage ${dispute.stage}`,
      );
    }
    await this.makerChecker.createTask(
      dispute.acquirerId,
      ApprovalEntityType.DISPUTE_REFUND,
      dispute.id,
      actorId,
    );
    await this.prisma.payment.update({
      where: { id: dispute.paymentId },
      data: { status: 'REFUND_PENDING' },
    });
    const updated = await this.disputes.updateStage(
      id,
      'REFUND_PENDING_CHECKER',
    );
    await this.audit.record({
      actorId,
      action: 'DISPUTE_REFUND_INITIATED',
      entityType: 'dispute',
      entityId: id,
    });
    return updated;
  }

  async resolveWithoutRefund(
    id: string,
    actorId: string,
    notes: string,
  ): Promise<DisputeWithRelations> {
    const dispute = await this.getById(id);
    if (!['INVESTIGATION', 'EVIDENCE_REQUESTED'].includes(dispute.stage)) {
      throw new ConflictException(
        `Cannot close this dispute while it is in stage ${dispute.stage}`,
      );
    }
    await this.prisma.payment.update({
      where: { id: dispute.paymentId },
      data: { status: 'SUCCESS' },
    });
    const updated = await this.disputes.updateStage(id, 'RESOLVED_NO_REFUND', {
      resolutionNotes: notes,
      resolvedAt: new Date(),
    });
    await this.audit.record({
      actorId,
      action: 'DISPUTE_RESOLVED_NO_REFUND',
      entityType: 'dispute',
      entityId: id,
      metadata: { notes },
    });
    return updated;
  }

  // ── DisputeRefundApprovalPort — called back by ApproveTaskHandler/RejectTaskHandler ──

  async onCheckerApproved(disputeId: string, checkerId: string): Promise<void> {
    const dispute = await this.getById(disputeId);
    // Marks the original payment reversed for reporting. There is no
    // TIPS/CBS refund-initiation integration here — no second payment
    // record is created for the actual money movement (see class doc).
    await this.prisma.payment.update({
      where: { id: dispute.paymentId },
      data: { status: 'REVERSED' },
    });
    await this.disputes.updateStage(disputeId, 'RESOLVED_REFUNDED', {
      resolvedAt: new Date(),
    });
    await this.audit.record({
      actorId: checkerId,
      action: 'DISPUTE_REFUND_APPROVED',
      entityType: 'dispute',
      entityId: disputeId,
    });
  }

  async onCheckerRejected(
    disputeId: string,
    checkerId: string,
    notes?: string,
  ): Promise<void> {
    const dispute = await this.getById(disputeId);
    await this.prisma.payment.update({
      where: { id: dispute.paymentId },
      data: { status: 'SUCCESS' },
    });
    await this.disputes.updateStage(disputeId, 'REJECTED', {
      resolutionNotes: notes,
      resolvedAt: new Date(),
    });
    await this.audit.record({
      actorId: checkerId,
      action: 'DISPUTE_REFUND_REJECTED',
      entityType: 'dispute',
      entityId: disputeId,
      metadata: notes ? { notes } : undefined,
    });
  }
}
