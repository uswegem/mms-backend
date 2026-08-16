import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReconciliationRepository } from '../persistence/reconciliation.repository';
import { ReconciliationService } from '../../application/services/reconciliation.service';

function yesterdayAtMidnightUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
}

/** Runs after the 02:00 settlement sweep — matches every merchant settled yesterday. */
@Injectable()
export class ReconciliationMatchJob {
  private readonly logger = new Logger(ReconciliationMatchJob.name);

  constructor(
    private readonly reconciliation: ReconciliationRepository,
    private readonly matcher: ReconciliationService,
  ) {}

  @Cron('0 3 * * *')
  async run(): Promise<void> {
    const cycleDate = yesterdayAtMidnightUtc();
    const merchantIds =
      await this.reconciliation.findMerchantIdsWithCycleOn(cycleDate);

    let totalExceptions = 0;
    for (const merchantId of merchantIds) {
      const summary = await this.matcher.runMatch(merchantId, cycleDate);
      totalExceptions += summary.exceptions;
    }

    if (merchantIds.length > 0) {
      this.logger.log(
        `Reconciliation match: ${merchantIds.length} merchant(s), ${totalExceptions} exception(s) raised.`,
      );
    }
  }
}
