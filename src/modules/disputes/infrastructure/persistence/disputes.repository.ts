import { Injectable } from '@nestjs/common';
import { DisputeStage, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

const disputeInclude = {
  payment: true,
  evidence: { orderBy: { uploadedAt: 'desc' as const } },
} satisfies Prisma.DisputeInclude;

export type DisputeWithRelations = Prisma.DisputeGetPayload<{
  include: typeof disputeInclude;
}>;

@Injectable()
export class DisputesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async nextCaseNo(acquirerId: string): Promise<string> {
    const count = await this.prisma.dispute.count({ where: { acquirerId } });
    const year = new Date().getFullYear();
    return `DSP-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(data: {
    acquirerId: string;
    merchantId: string;
    paymentId: string;
    raisedBy: 'MERCHANT' | 'PAYER' | 'LFB_OPS';
    reason: Prisma.DisputeCreateInput['reason'];
    description: string;
    disputedAmount: Prisma.Decimal | number | string;
    createdBy: string;
  }): Promise<DisputeWithRelations> {
    const caseNo = await this.nextCaseNo(data.acquirerId);
    return this.prisma.dispute.create({
      data: {
        acquirerId: data.acquirerId,
        merchantId: data.merchantId,
        paymentId: data.paymentId,
        raisedBy: data.raisedBy,
        reason: data.reason,
        description: data.description,
        disputedAmount: data.disputedAmount,
        createdBy: data.createdBy,
        caseNo,
      },
      include: disputeInclude,
    });
  }

  async findById(id: string): Promise<DisputeWithRelations | null> {
    return this.prisma.dispute.findUnique({
      where: { id },
      include: disputeInclude,
    });
  }

  async findMany(
    acquirerId: string,
    merchantId?: string,
    stage?: DisputeStage,
    page = 1,
    limit = 20,
  ) {
    const where: Prisma.DisputeWhereInput = {
      acquirerId,
      ...(merchantId ? { merchantId } : {}),
      ...(stage ? { stage } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        include: disputeInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return { items, total };
  }

  async addEvidence(data: {
    disputeId: string;
    fileName: string;
    s3Bucket: string;
    s3Key: string;
    mimeType?: string;
    fileSize?: number;
    uploadedBy: string;
  }) {
    return this.prisma.disputeEvidence.create({ data });
  }

  async updateStage(
    id: string,
    stage: DisputeStage,
    extra?: { resolutionNotes?: string; resolvedAt?: Date },
  ): Promise<DisputeWithRelations> {
    return this.prisma.dispute.update({
      where: { id },
      data: { stage, ...extra },
      include: disputeInclude,
    });
  }
}
