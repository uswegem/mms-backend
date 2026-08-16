import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { TransactionsRepository } from '../persistence/transactions.repository';
import { TipsPaymentProvider } from '../../application/ports/tips-payment.port';

/**
 * Brief §4.5: "Failed/timeout transaction reconciliation job ... with
 * retry and manual override." Payments stuck in INITIATED past the
 * timeout window get one status query against TIPS; still-pending ones
 * are left for the next run (retry), and ones TIPS reports as failed (or
 * that the mock can't resolve) are marked FAILED — final resolution
 * beyond that is the manual-override endpoint, not this job's job.
 */
@Injectable()
export class PaymentTimeoutReconciliationJob {
  private readonly logger = new Logger(PaymentTimeoutReconciliationJob.name);

  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly tips: TipsPaymentProvider,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<void> {
    const timeoutMinutes =
      this.config.get<number>('payments.timeoutMinutes') ?? 10;
    const olderThan = new Date(Date.now() - timeoutMinutes * 60_000);
    const stuck = await this.transactions.findStuckInitiated(olderThan);

    let resolved = 0;
    for (const payment of stuck) {
      const result = await this.tips.queryPaymentStatus(payment.tipsEndToEndId);

      if (result.status === 'PENDING' || result.status === 'UNKNOWN') {
        continue; // leave for the next run — this is the "retry" half of §4.5
      }

      const nextStatus =
        result.status === 'SUCCESS'
          ? PaymentStatus.SUCCESS
          : PaymentStatus.FAILED;
      await this.transactions.updateStatus(
        payment.id,
        nextStatus,
        result.tipsSettledAt,
      );
      await this.audit.record({
        actorId: null,
        action: 'PAYMENT_TIMEOUT_RESOLVED',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          from: PaymentStatus.INITIATED,
          to: nextStatus,
          tipsEndToEndId: payment.tipsEndToEndId,
        },
      });
      resolved += 1;
    }

    if (stuck.length > 0) {
      this.logger.log(
        `Payment timeout sweep: ${stuck.length} stuck INITIATED payment(s), resolved ${resolved}.`,
      );
    }
  }
}
