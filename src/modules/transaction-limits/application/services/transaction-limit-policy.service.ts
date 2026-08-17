import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, TransactionLimitPolicy, KycTier } from '@prisma/client';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@infrastructure/cache/redis.constants';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

export type LimitBreach = 'PER_TRANSACTION' | 'DAILY' | 'MONTHLY';

export interface LimitCheckResult {
  allowed: boolean;
  breach?: LimitBreach;
  policy: TransactionLimitPolicy;
}

const DAILY_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days — comfortably outlives the day it counts
const MONTHLY_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days — comfortably outlives the month it counts

function dailyKey(merchantId: string, at: Date): string {
  const d = at.toISOString().slice(0, 10); // YYYY-MM-DD
  return `txlimit:daily:${merchantId}:${d}`;
}

function monthlyKey(merchantId: string, at: Date): string {
  const m = at.toISOString().slice(0, 7); // YYYY-MM
  return `txlimit:monthly:${merchantId}:${m}`;
}

/**
 * Brief §4.3.3: cross-cutting transaction-limit enforcement keyed by
 * merchant kycTier. Per-transaction limit is a pure DB-value comparison;
 * daily/monthly aggregate caps are enforced via Redis rolling counters
 * (brief's own suggestion, "likely Redis-backed for performance") rather
 * than a per-check Postgres aggregate query against the payments table.
 *
 * Redis is @Optional() and used with the same best-effort posture as
 * IdempotencyService elsewhere in this codebase: if Redis is unavailable,
 * the per-transaction ceiling (the DB-value check) still applies, but
 * daily/monthly aggregate enforcement silently no-ops rather than blocking
 * all payments on an infrastructure dependency this feature doesn't
 * strictly require to degrade safely.
 */
@Injectable()
export class TransactionLimitPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async getPolicy(tier: KycTier): Promise<TransactionLimitPolicy> {
    const policy = await this.prisma.transactionLimitPolicy.findUnique({
      where: { tier },
    });
    if (!policy) {
      throw new NotFoundException(
        `No transaction limit policy configured for tier ${tier}`,
      );
    }
    return policy;
  }

  async listPolicies(): Promise<TransactionLimitPolicy[]> {
    return this.prisma.transactionLimitPolicy.findMany({
      orderBy: { tier: 'asc' },
    });
  }

  async updatePolicy(
    tier: KycTier,
    data: {
      perTransactionLimit?: number;
      dailyLimit?: number;
      monthlyLimit?: number;
    },
    actorId: string,
  ): Promise<TransactionLimitPolicy> {
    return this.prisma.transactionLimitPolicy.update({
      where: { tier },
      data: { ...data, updatedBy: actorId },
    });
  }

  /**
   * Checks `amount` against the tier's per-transaction, daily, and monthly
   * caps, atomically reserving it against the rolling daily/monthly Redis
   * counters if allowed. Callers that decide NOT to proceed with the
   * transaction after a true result (shouldn't normally happen, but) must
   * not double-count — this method only reserves once per call.
   *
   * Uses Redis's INCRBYFLOAT for the rolling totals — adequate for a
   * velocity *threshold comparison*, not accounting-grade precision. The
   * ledger of record for actual settled amounts remains the Payment table
   * (Prisma Decimal), which this never touches.
   */
  async checkAndReserve(
    merchantId: string,
    tier: KycTier,
    amount: Prisma.Decimal | number | string,
    at: Date = new Date(),
  ): Promise<LimitCheckResult> {
    const policy = await this.getPolicy(tier);
    const amt = new Prisma.Decimal(amount);

    if (amt.gt(policy.perTransactionLimit)) {
      return { allowed: false, breach: 'PER_TRANSACTION', policy };
    }

    if (!this.redis) {
      return { allowed: true, policy };
    }

    const dKey = dailyKey(merchantId, at);
    const mKey = monthlyKey(merchantId, at);
    const amountNumber = amt.toNumber();

    const dailyTotal = await this.redis.incrbyfloat(dKey, amountNumber);
    await this.redis.expire(dKey, DAILY_TTL_SECONDS);
    const monthlyTotal = await this.redis.incrbyfloat(mKey, amountNumber);
    await this.redis.expire(mKey, MONTHLY_TTL_SECONDS);

    if (Number(dailyTotal) > policy.dailyLimit.toNumber()) {
      await this.rollback(dKey, mKey, amountNumber);
      return { allowed: false, breach: 'DAILY', policy };
    }

    if (Number(monthlyTotal) > policy.monthlyLimit.toNumber()) {
      await this.rollback(dKey, mKey, amountNumber);
      return { allowed: false, breach: 'MONTHLY', policy };
    }

    return { allowed: true, policy };
  }

  private async rollback(
    dKey: string,
    mKey: string,
    amountNumber: number,
  ): Promise<void> {
    if (!this.redis) return;
    await this.redis.incrbyfloat(dKey, -amountNumber);
    await this.redis.incrbyfloat(mKey, -amountNumber);
  }
}
