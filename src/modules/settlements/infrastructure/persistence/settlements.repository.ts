import { Injectable } from '@nestjs/common';
import { Prisma, PaymentStatus, SettlementCycleStatus } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class SettlementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Merchants with at least one unswept SUCCESS payment — the sweep job's candidate set. */
  async findMerchantIdsWithUnsweptPayments(): Promise<string[]> {
    const rows = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.SUCCESS, settlementCycleId: null },
      distinct: ['merchantId'],
      select: { merchantId: true },
    });
    return rows.map((r) => r.merchantId);
  }

  async findUnsweptPayments(merchantId: string) {
    return this.prisma.payment.findMany({
      where: {
        merchantId,
        status: PaymentStatus.SUCCESS,
        settlementCycleId: null,
      },
    });
  }

  async findMerchantForSettlement(merchantId: string) {
    return this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        settlementConfig: true,
        settlementAccounts: {
          where: { isPrimary: true, deletedAt: null },
          take: 1,
        },
      },
    });
  }

  /** Creates the cycle and links its payments in one transaction — a partial sweep must never happen. */
  async createCycleWithPayments(
    data: Prisma.SettlementCycleUncheckedCreateInput,
    paymentIds: string[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const cycle = await tx.settlementCycle.create({ data });
      if (paymentIds.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: paymentIds } },
          data: { settlementCycleId: cycle.id },
        });
      }
      return cycle;
    });
  }

  async markPosted(cycleId: string, cbsPostingRef: string, postedAt: Date) {
    return this.prisma.settlementCycle.update({
      where: { id: cycleId },
      data: { status: SettlementCycleStatus.POSTED, cbsPostingRef, postedAt },
    });
  }

  async markFailed(cycleId: string, failureReason: string) {
    return this.prisma.settlementCycle.update({
      where: { id: cycleId },
      data: { status: SettlementCycleStatus.FAILED, failureReason },
    });
  }

  async findById(id: string) {
    return this.prisma.settlementCycle.findUnique({ where: { id } });
  }

  async list(filters: {
    merchantId?: string;
    status?: SettlementCycleStatus;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.SettlementCycleWhereInput = {
      merchantId: filters.merchantId,
      status: filters.status,
    };
    const [items, total] = await Promise.all([
      this.prisma.settlementCycle.findMany({
        where,
        orderBy: { cycleDate: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.settlementCycle.count({ where }),
    ]);
    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }
}
