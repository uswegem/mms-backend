import { Injectable } from '@nestjs/common';
import { OnboardingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class OnboardingAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    applicationId: string;
    merchantId: string;
    action: string;
    oldStatus?: OnboardingStatus | string | null;
    newStatus?: OnboardingStatus | string | null;
    performedBy: string;
    remarks?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.onboardingAuditLog.create({
      data: {
        applicationId: params.applicationId,
        merchantId: params.merchantId,
        action: params.action,
        oldStatus: params.oldStatus ?? undefined,
        newStatus: params.newStatus ?? undefined,
        performedBy: params.performedBy,
        remarks: params.remarks,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(applicationId: string) {
    return this.prisma.onboardingAuditLog.findMany({
      where: { applicationId },
      orderBy: { performedAt: 'desc' },
    });
  }
}
