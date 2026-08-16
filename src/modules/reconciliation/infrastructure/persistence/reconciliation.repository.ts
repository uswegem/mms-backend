import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PaymentStatus,
  ReconciliationExceptionStatus,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class ReconciliationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSuccessPayments(merchantId: string, cycleDate: Date) {
    const start = cycleDate;
    const end = new Date(cycleDate.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.payment.findMany({
      where: {
        merchantId,
        status: PaymentStatus.SUCCESS,
        receivedAt: { gte: start, lt: end },
      },
      select: { id: true, tipsEndToEndId: true, amount: true },
    });
  }

  /**
   * Replaces the OPEN exceptions for a merchant/cycleDate with a fresh set
   * — a re-run recomputes from scratch. RESOLVED/WRITTEN_OFF rows are left
   * alone; they're a human decision, not something a re-match should erase.
   */
  async replaceOpenExceptions(
    merchantId: string,
    cycleDate: Date,
    rows: Prisma.ReconciliationExceptionUncheckedCreateInput[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.reconciliationException.deleteMany({
        where: {
          merchantId,
          cycleDate,
          status: ReconciliationExceptionStatus.OPEN,
        },
      });
      if (rows.length > 0) {
        await tx.reconciliationException.createMany({ data: rows });
      }
    });
  }

  async findById(id: string) {
    return this.prisma.reconciliationException.findUnique({ where: { id } });
  }

  async resolve(
    id: string,
    status: ReconciliationExceptionStatus,
    resolutionNotes: string | undefined,
    resolvedBy: string,
  ) {
    return this.prisma.reconciliationException.update({
      where: { id },
      data: { status, resolutionNotes, resolvedBy, resolvedAt: new Date() },
    });
  }

  async list(filters: {
    merchantId?: string;
    status?: ReconciliationExceptionStatus;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.ReconciliationExceptionWhereInput = {
      merchantId: filters.merchantId,
      status: filters.status,
    };
    const [items, total] = await Promise.all([
      this.prisma.reconciliationException.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.reconciliationException.count({ where }),
    ]);
    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }

  /** Distinct merchants with a settlement cycle dated exactly `cycleDate` — the daily job's candidate set. */
  async findMerchantIdsWithCycleOn(cycleDate: Date): Promise<string[]> {
    const rows = await this.prisma.settlementCycle.findMany({
      where: { cycleDate },
      distinct: ['merchantId'],
      select: { merchantId: true },
    });
    return rows.map((r) => r.merchantId);
  }
}
