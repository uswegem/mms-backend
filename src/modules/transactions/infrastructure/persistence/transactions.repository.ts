import { Injectable } from '@nestjs/common';
import { Prisma, PaymentStatus } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

export interface LedgerFilters {
  merchantId?: string;
  storeId?: string;
  status?: PaymentStatus;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.PaymentUncheckedCreateInput) {
    return this.prisma.payment.create({ data });
  }

  async findByTipsEndToEndId(tipsEndToEndId: string) {
    return this.prisma.payment.findUnique({ where: { tipsEndToEndId } });
  }

  async findById(id: string) {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  async updateStatus(id: string, status: PaymentStatus, tipsSettledAt?: Date) {
    return this.prisma.payment.update({
      where: { id },
      data: { status, tipsSettledAt },
    });
  }

  async list(filters: LedgerFilters) {
    const where: Prisma.PaymentWhereInput = {
      merchantId: filters.merchantId,
      storeId: filters.storeId,
      status: filters.status,
      receivedAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
    };

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }

  /** Payments still INITIATED past `olderThan` — the timeout-reconciliation job's candidate set. */
  async findStuckInitiated(olderThan: Date) {
    return this.prisma.payment.findMany({
      where: { status: PaymentStatus.INITIATED, receivedAt: { lt: olderThan } },
    });
  }
}
