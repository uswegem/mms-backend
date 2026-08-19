import { Injectable } from '@nestjs/common';
import { KycUpgradeStatus, Prisma, VerificationResult } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

const requestInclude = {
  documents: { orderBy: { uploadedAt: 'desc' as const } },
} satisfies Prisma.KycUpgradeRequestInclude;

export type KycUpgradeRequestWithRelations =
  Prisma.KycUpgradeRequestGetPayload<{
    include: typeof requestInclude;
  }>;

@Injectable()
export class KycUpgradeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    acquirerId: string;
    merchantId: string;
    fromTier: Prisma.KycUpgradeRequestCreateInput['fromTier'];
    toTier: Prisma.KycUpgradeRequestCreateInput['toTier'];
    createdBy: string;
  }): Promise<KycUpgradeRequestWithRelations> {
    return this.prisma.kycUpgradeRequest.create({
      data,
      include: requestInclude,
    });
  }

  async findById(id: string): Promise<KycUpgradeRequestWithRelations | null> {
    return this.prisma.kycUpgradeRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
  }

  /** At most one non-terminal request per merchant — enforced in the service, not the schema. */
  async findActiveForMerchant(
    merchantId: string,
  ): Promise<KycUpgradeRequestWithRelations | null> {
    return this.prisma.kycUpgradeRequest.findFirst({
      where: {
        merchantId,
        status: { in: ['IN_PROGRESS', 'PENDING_CHECKER_APPROVAL'] },
      },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordTinVerification(
    id: string,
    data: {
      tin: string;
      result: VerificationResult;
      verifiedName?: string;
    },
  ): Promise<KycUpgradeRequestWithRelations> {
    return this.prisma.kycUpgradeRequest.update({
      where: { id },
      data: {
        tin: data.tin,
        tinVerificationResult: data.result,
        tinVerifiedName: data.verifiedName,
        tinVerifiedAt: new Date(),
      },
      include: requestInclude,
    });
  }

  async addDocument(data: {
    requestId: string;
    docType: string;
    fileName: string;
    s3Bucket: string;
    s3Key: string;
    mimeType?: string;
    fileSize?: number;
    uploadedBy: string;
  }) {
    return this.prisma.kycUpgradeDocument.create({ data });
  }

  async updateStatus(
    id: string,
    status: KycUpgradeStatus,
    extra?: { rejectionNotes?: string; decidedAt?: Date },
  ): Promise<KycUpgradeRequestWithRelations> {
    return this.prisma.kycUpgradeRequest.update({
      where: { id },
      data: { status, ...extra },
      include: requestInclude,
    });
  }
}
