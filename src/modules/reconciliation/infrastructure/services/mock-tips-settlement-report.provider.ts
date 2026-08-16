import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import {
  TipsSettlementReportLine,
  TipsSettlementReportProvider,
} from '../../application/ports/tips-settlement-report.port';

@Injectable()
export class MockTipsSettlementReportProvider extends TipsSettlementReportProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getSettlementReport(
    merchantId: string,
    cycleDate: Date,
  ): Promise<TipsSettlementReportLine[]> {
    const start = cycleDate;
    const end = new Date(cycleDate.getTime() + 24 * 60 * 60 * 1000);
    const payments = await this.prisma.payment.findMany({
      where: {
        merchantId,
        status: PaymentStatus.SUCCESS,
        receivedAt: { gte: start, lt: end },
      },
      select: { tipsEndToEndId: true, amount: true },
    });
    return payments.map((p) => ({
      tipsEndToEndId: p.tipsEndToEndId,
      amount: p.amount.toString(),
    }));
  }
}
