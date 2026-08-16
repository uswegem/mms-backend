import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SettlementCycleStatus } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { SettlementsRepository } from '../../infrastructure/persistence/settlements.repository';
import { CbsPostingProvider } from '../ports/cbs-posting.port';

function todayAtMidnightUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly settlements: SettlementsRepository,
    private readonly cbs: CbsPostingProvider,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Sweeps every merchant with unswept SUCCESS payments into a settlement
   * cycle for `cycleDate` (defaults to today, UTC midnight — T+0/T+1 is a
   * scheduling question for the cron trigger, not this method), computes
   * gross/MDR/net, then attempts CBS posting. One merchant's failure
   * doesn't block the others.
   */
  async sweepAndPost(
    cycleDate: Date = todayAtMidnightUtc(),
  ): Promise<{ swept: number; posted: number; failed: number }> {
    const merchantIds =
      await this.settlements.findMerchantIdsWithUnsweptPayments();
    let posted = 0;
    let failed = 0;

    for (const merchantId of merchantIds) {
      try {
        const cycle = await this.sweepMerchant(merchantId, cycleDate);
        await this.postCycle(cycle.id);
        posted += 1;
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Settlement sweep failed for merchant ${merchantId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (merchantIds.length > 0) {
      this.logger.log(
        `Settlement sweep: ${merchantIds.length} merchant(s) with unswept payments — ${posted} posted, ${failed} failed.`,
      );
    }
    return { swept: merchantIds.length, posted, failed };
  }

  private async sweepMerchant(merchantId: string, cycleDate: Date) {
    const payments = await this.settlements.findUnsweptPayments(merchantId);
    if (payments.length === 0) {
      throw new Error('No unswept payments — nothing to sweep');
    }

    const merchant =
      await this.settlements.findMerchantForSettlement(merchantId);
    if (!merchant) throw new Error('Merchant not found');

    const gross = payments.reduce(
      (sum, p) => sum.plus(p.amount),
      new Prisma.Decimal(0),
    );
    const mdrRate = merchant.settlementConfig?.mdr
      ? new Prisma.Decimal(merchant.settlementConfig.mdr)
      : new Prisma.Decimal(
          this.config.get<number>('settlement.defaultMdrRate') ?? 0.0085,
        );
    const mdr = gross.times(mdrRate).toDecimalPlaces(2);
    const net = gross.minus(mdr);

    const cycle = await this.settlements.createCycleWithPayments(
      {
        merchantId,
        cycleDate,
        status: SettlementCycleStatus.SWEPT,
        transactionCount: payments.length,
        grossAmount: gross,
        mdrAmount: mdr,
        netAmount: net,
        settlementAccountId: merchant.settlementAccounts[0]?.id,
        sweptAt: new Date(),
      },
      payments.map((p) => p.id),
    );

    await this.audit.record({
      actorId: null,
      action: 'SETTLEMENT_CYCLE_SWEPT',
      entityType: 'settlement_cycle',
      entityId: cycle.id,
      metadata: {
        merchantId,
        transactionCount: payments.length,
        gross: gross.toString(),
        net: net.toString(),
      },
    });

    return cycle;
  }

  private async postCycle(cycleId: string): Promise<void> {
    const cycle = await this.settlements.findById(cycleId);
    if (!cycle) throw new NotFoundException('Settlement cycle not found');

    const merchant = await this.settlements.findMerchantForSettlement(
      cycle.merchantId,
    );
    const account = merchant?.settlementAccounts[0];
    if (!account) {
      await this.settlements.markFailed(
        cycleId,
        'No verified primary settlement account on file',
      );
      return;
    }

    try {
      const result = await this.cbs.postSettlement({
        merchantId: cycle.merchantId,
        accountNumber: account.accountNumber,
        netAmount: cycle.netAmount.toString(),
        cycleDate: cycle.cycleDate,
      });
      await this.settlements.markPosted(
        cycleId,
        result.postingRef,
        result.postedAt,
      );
      await this.audit.record({
        actorId: null,
        action: 'SETTLEMENT_CYCLE_POSTED',
        entityType: 'settlement_cycle',
        entityId: cycleId,
        metadata: { cbsPostingRef: result.postingRef },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'CBS posting failed';
      await this.settlements.markFailed(cycleId, reason);
    }
  }

  async list(query: {
    merchantId?: string;
    status?: SettlementCycleStatus;
    page: number;
    pageSize: number;
  }) {
    return this.settlements.list(query);
  }

  async getById(id: string) {
    const cycle = await this.settlements.findById(id);
    if (!cycle) throw new NotFoundException('Settlement cycle not found');
    return cycle;
  }
}
