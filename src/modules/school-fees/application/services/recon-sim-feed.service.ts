import { Injectable } from '@nestjs/common';
import { ExternalSettlementSource, FeePaymentRecordStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class ReconSimFeedService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates paired TIPS + CBS legs from MMS completed payments (and intentional mismatches).
   * When source is omitted, creates a three-way-ready feed set.
   */
  async generateFromMmsPayments(
    opts: {
      source?: ExternalSettlementSource;
      dateFrom?: Date;
      dateTo?: Date;
      take?: number;
      threeWay?: boolean;
    } = {},
  ) {
    const threeWay = opts.threeWay || !opts.source;
    const payments = await this.prisma.feePayment.findMany({
      where: {
        status: FeePaymentRecordStatus.COMPLETED,
        gatewayPaidAt: { gte: opts.dateFrom, lte: opts.dateTo },
        reconciliationMatches: { none: {} },
      },
      orderBy: { gatewayPaidAt: 'asc' },
      take: opts.take ?? 20,
    });

    let created = 0;
    let duplicatesIgnored = 0;

    for (const [index, payment] of payments.entries()) {
      if (index % 5 === 4) continue; // leave some MMS unmatched
      const kind = index % 4;
      const valueDate = new Date(payment.gatewayPaidAt ?? payment.mmsReceivedAt);
      if (kind === 1) valueDate.setUTCDate(valueDate.getUTCDate() + 2); // soft variance band
      if (kind === 3) valueDate.setUTCDate(valueDate.getUTCDate() + 5); // hard → DATE_VARIANCE_REVIEW

      const tipsTxnId = kind === 0 ? payment.gatewayTxnRef : `SIM-TIPS-${payment.id}-${kind}`;
      const amount =
        kind === 2 ? new Prisma.Decimal(payment.amount).plus(1) : payment.amount;

      if (!opts.source || opts.source === ExternalSettlementSource.TIPS || threeWay) {
        try {
          await this.prisma.externalSettlementRecord.create({
            data: {
              source: ExternalSettlementSource.TIPS,
              externalTxnId: tipsTxnId,
              paymentReference: payment.paymentReference,
              amount,
              currency: payment.currency,
              valueDate,
              externalStatus: 'SETTLED',
              rawPayload: {
                simulator: true,
                paymentId: payment.id,
                kind,
              } as Prisma.InputJsonValue,
            },
          });
          created++;
        } catch {
          duplicatesIgnored++;
        }
      }

      if (!opts.source || opts.source === ExternalSettlementSource.CBS || threeWay) {
        try {
          await this.prisma.externalSettlementRecord.create({
            data: {
              source: ExternalSettlementSource.CBS,
              externalTxnId: `SIM-CBS-${payment.id}-${kind}`,
              tipsTxnId: kind === 2 ? null : tipsTxnId,
              paymentReference: payment.paymentReference,
              amount: kind === 2 ? new Prisma.Decimal(payment.amount).plus(5) : payment.amount,
              currency: payment.currency,
              valueDate,
              creditAccount: 'SCHOOL-COLLECTION',
              narration: kind === 2 ? 'BULK SCHOOL FEES' : 'FEE COLLECTION',
              externalStatus: 'POSTED',
              rawPayload: {
                simulator: true,
                paymentId: payment.id,
                kind,
                threeWay,
              } as Prisma.InputJsonValue,
            },
          });
          created++;
        } catch {
          duplicatesIgnored++;
        }
      }
    }

    // Orphans
    if (!opts.source || opts.source === ExternalSettlementSource.TIPS || threeWay) {
      await this.prisma.externalSettlementRecord.create({
        data: {
          source: ExternalSettlementSource.TIPS,
          externalTxnId: `SIM-ORPHAN-TIPS-${crypto.randomUUID()}`,
          paymentReference: `999${Date.now().toString().slice(-10)}`,
          amount: new Prisma.Decimal('1000.00'),
          currency: 'TZS',
          valueDate: new Date(),
          externalStatus: 'SETTLED',
          rawPayload: { simulator: true, orphan: true },
        },
      });
      created++;
    }
    if (!opts.source || opts.source === ExternalSettlementSource.CBS || threeWay) {
      await this.prisma.externalSettlementRecord.create({
        data: {
          source: ExternalSettlementSource.CBS,
          externalTxnId: `SIM-ORPHAN-CBS-${crypto.randomUUID()}`,
          paymentReference: `998${Date.now().toString().slice(-10)}`,
          amount: new Prisma.Decimal('2500.00'),
          currency: 'TZS',
          valueDate: new Date(),
          creditAccount: 'SCHOOL-COLLECTION',
          narration: 'ORPHAN CBS',
          externalStatus: 'POSTED',
          rawPayload: { simulator: true, orphan: true },
        },
      });
      created++;
    }

    return {
      threeWay,
      source: opts.source ?? 'BOTH',
      paymentsConsidered: payments.length,
      created,
      duplicatesIgnored,
    };
  }
}
