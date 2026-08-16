import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FeePaymentRecordStatus } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { money } from '../../domain/fee-money.util';

@Injectable()
export class DailyCollectionSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async computeAndStore(merchantId: string, date: Date, force = false) {
    const snapshotDate = this.startOfDay(date);
    const existing = await this.prisma.schoolDailyCollectionSnapshot.findUnique({ where: { merchantId_snapshotDate: { merchantId, snapshotDate } } });
    if (existing && !force) return existing;
    const end = new Date(snapshotDate); end.setUTCDate(end.getUTCDate() + 1);
    const [payments, outstanding] = await Promise.all([
      this.prisma.feePayment.findMany({ where: { merchantId, status: FeePaymentRecordStatus.COMPLETED, gatewayPaidAt: { gte: snapshotDate, lt: end } }, select: { amount: true, channel: true } }),
      this.prisma.feeInvoice.aggregate({ where: { merchantId, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } }, _sum: { outstandingBalance: true } }),
    ]);
    const byChannel = payments.reduce<Record<string, string>>((result, payment) => {
      result[payment.channel] = money(result[payment.channel] ?? 0).plus(payment.amount).toFixed(2);
      return result;
    }, {});
    const data = {
      totalCollected: payments.reduce((total, payment) => total.plus(payment.amount), money(0)),
      paymentCount: payments.length,
      totalOutstanding: money(outstanding._sum.outstandingBalance ?? 0),
      byChannel,
    };
    if (existing) return this.prisma.schoolDailyCollectionSnapshot.update({ where: { id: existing.id }, data });
    return this.prisma.schoolDailyCollectionSnapshot.create({ data: { merchantId, snapshotDate, ...data } });
  }

  async computeAllSchools(date: Date) {
    const schools = await this.prisma.merchant.findMany({ where: { isSchool: true, deletedAt: null }, select: { id: true } });
    return Promise.all(schools.map((school) => this.computeAndStore(school.id, date)));
  }

  @Cron('15 1 * * *')
  async snapshotYesterday() {
    const date = new Date(); date.setUTCDate(date.getUTCDate() - 1);
    return this.computeAllSchools(date);
  }

  private startOfDay(date: Date) {
    const result = new Date(date); result.setUTCHours(0, 0, 0, 0); return result;
  }
}
