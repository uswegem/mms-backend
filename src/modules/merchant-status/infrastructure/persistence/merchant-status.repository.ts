import { Injectable } from '@nestjs/common';
import {
  MerchantStatus,
  MerchantStatusAction,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { StatusTransitionRule } from '../../domain/services/status-transition.engine';

const merchantInclude = {
  profile: true,
  kyc: true,
} satisfies Prisma.MerchantInclude;

export type MerchantWithRelations = Prisma.MerchantGetPayload<{
  include: typeof merchantInclude;
}>;

@Injectable()
export class MerchantStatusRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadTransitionRules(): Promise<StatusTransitionRule[]> {
    const rows = await this.prisma.statusTransition.findMany({
      where: { isActive: true },
    });
    if (rows.length === 0) return [];
    return rows.map((r) => ({
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      action: r.action,
      requiredPermission: r.requiredPermission,
    }));
  }

  async findMerchantById(id: string): Promise<MerchantWithRelations | null> {
    return this.prisma.merchant.findFirst({
      where: { id, deletedAt: null },
      include: merchantInclude,
    });
  }

  async hasRecentDuplicate(
    merchantId: string,
    action: MerchantStatusAction,
    withinMs = 5000,
  ): Promise<boolean> {
    const since = new Date(Date.now() - withinMs);
    const count = await this.prisma.merchantStatusHistory.count({
      where: { merchantId, action, createdAt: { gte: since } },
    });
    return count > 0;
  }

  async transitionStatus(data: {
    merchantId: string;
    fromStatus: MerchantStatus;
    toStatus: MerchantStatus;
    action: MerchantStatusAction;
    actorId: string;
    reason?: string;
    notes?: string;
    onboardedAt?: Date;
  }): Promise<MerchantWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.merchant.findUniqueOrThrow({
        where: { id: data.merchantId },
      });
      if (current.status !== data.fromStatus) {
        throw new Error('STATUS_CONFLICT');
      }

      await tx.merchantStatusHistory.create({
        data: {
          merchantId: data.merchantId,
          fromStatus: data.fromStatus,
          toStatus: data.toStatus,
          action: data.action,
          actorId: data.actorId,
          reason: data.reason,
          notes: data.notes,
        },
      });

      return tx.merchant.update({
        where: { id: data.merchantId },
        data: {
          status: data.toStatus,
          updatedBy: data.actorId,
          ...(data.onboardedAt ? { onboardedAt: data.onboardedAt } : {}),
        },
        include: merchantInclude,
      });
    });
  }

  async listHistory(merchantId: string, limit = 50) {
    return this.prisma.merchantStatusHistory.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async seedTransitions(rules: StatusTransitionRule[]): Promise<void> {
    for (const rule of rules) {
      await this.prisma.statusTransition.upsert({
        where: {
          fromStatus_toStatus_action: {
            fromStatus: rule.fromStatus,
            toStatus: rule.toStatus,
            action: rule.action,
          },
        },
        update: {
          requiredPermission: rule.requiredPermission,
          isActive: true,
        },
        create: {
          fromStatus: rule.fromStatus,
          toStatus: rule.toStatus,
          action: rule.action,
          requiredPermission: rule.requiredPermission,
        },
      });
    }
  }
}
