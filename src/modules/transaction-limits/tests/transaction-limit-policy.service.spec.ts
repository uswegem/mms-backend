import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { TransactionLimitPolicyService } from '../application/services/transaction-limit-policy.service';

function buildPolicy(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'policy-1',
    tier: 'TIER_2',
    perTransactionLimit: new Prisma.Decimal(5_000_000),
    dailyLimit: new Prisma.Decimal(20_000_000),
    monthlyLimit: new Prisma.Decimal(100_000_000),
    currency: 'TZS',
    updatedAt: new Date(),
    updatedBy: null,
    ...overrides,
  };
}

function createMockRedis() {
  const store = new Map<string, number>();
  return {
    store,
    incrbyfloat: jest.fn((key: string, delta: number) => {
      const next = (store.get(key) ?? 0) + delta;
      store.set(key, next);
      return Promise.resolve(String(next));
    }),
    expire: jest.fn().mockResolvedValue(1),
  };
}

function buildService(overrides: { redis?: unknown; policy?: unknown } = {}) {
  const prisma = {
    transactionLimitPolicy: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          'policy' in overrides ? overrides.policy : buildPolicy(),
        ),
      findMany: jest.fn().mockResolvedValue([buildPolicy()]),
      update: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: Partial<Record<string, unknown>> }) =>
            Promise.resolve(buildPolicy(data)),
        ),
    },
  };
  const redis = 'redis' in overrides ? overrides.redis : createMockRedis();

  const service = new TransactionLimitPolicyService(
    prisma as never,
    redis as never,
  );
  return { service, prisma, redis };
}

describe('TransactionLimitPolicyService', () => {
  describe('getPolicy', () => {
    it('returns the configured policy for a tier', async () => {
      const { service } = buildService();
      await expect(service.getPolicy('TIER_2')).resolves.toMatchObject({
        tier: 'TIER_2',
      });
    });

    it('throws NotFoundException when no policy is configured for the tier', async () => {
      const { service } = buildService({ policy: null });
      await expect(service.getPolicy('TIER_2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('checkAndReserve — per-transaction limit', () => {
    it('rejects an amount over the per-transaction limit without touching Redis', async () => {
      const { service, redis } = buildService();
      const result = await service.checkAndReserve(
        'merchant-1',
        'TIER_2',
        6_000_000,
      );

      expect(result).toMatchObject({
        allowed: false,
        breach: 'PER_TRANSACTION',
      });
      expect(
        (redis as ReturnType<typeof createMockRedis>).incrbyfloat,
      ).not.toHaveBeenCalled();
    });

    it('allows an amount within the per-transaction limit', async () => {
      const { service } = buildService();
      const result = await service.checkAndReserve(
        'merchant-1',
        'TIER_2',
        1_000_000,
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('checkAndReserve — daily/monthly aggregate limits (Redis)', () => {
    it('reserves the amount against both the daily and monthly rolling counters when allowed', async () => {
      const { service, redis } = buildService();
      await service.checkAndReserve('merchant-1', 'TIER_2', 1_000_000);

      const mockRedis = redis as ReturnType<typeof createMockRedis>;
      expect(mockRedis.incrbyfloat).toHaveBeenCalledTimes(2);
      expect(mockRedis.expire).toHaveBeenCalledTimes(2);
    });

    it('rejects once cumulative daily usage would exceed the daily cap, and rolls back the reservation', async () => {
      const { service, redis } = buildService();
      const mockRedis = redis as ReturnType<typeof createMockRedis>;

      // Pre-load the daily counter to just under the cap so one more
      // 1,000,000 reservation pushes it over.
      const today = new Date().toISOString().slice(0, 10);
      mockRedis.store.set(`txlimit:daily:merchant-1:${today}`, 19_500_000);

      const result = await service.checkAndReserve(
        'merchant-1',
        'TIER_2',
        1_000_000,
      );

      expect(result).toMatchObject({ allowed: false, breach: 'DAILY' });
      // Rolled back: daily counter is back to its pre-reservation value.
      expect(mockRedis.store.get(`txlimit:daily:merchant-1:${today}`)).toBe(
        19_500_000,
      );
    });

    it('rejects once cumulative monthly usage would exceed the monthly cap, and rolls back both counters', async () => {
      const { service, redis } = buildService();
      const mockRedis = redis as ReturnType<typeof createMockRedis>;

      const month = new Date().toISOString().slice(0, 7);
      mockRedis.store.set(`txlimit:monthly:merchant-1:${month}`, 99_500_000);

      const result = await service.checkAndReserve(
        'merchant-1',
        'TIER_2',
        1_000_000,
      );

      expect(result).toMatchObject({ allowed: false, breach: 'MONTHLY' });
      expect(mockRedis.store.get(`txlimit:monthly:merchant-1:${month}`)).toBe(
        99_500_000,
      );
    });

    it('does not reserve against Redis at all and still allows the transaction when Redis is unavailable', async () => {
      const { service } = buildService({ redis: null });
      const result = await service.checkAndReserve(
        'merchant-1',
        'TIER_2',
        1_000_000,
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('updatePolicy', () => {
    it('updates the given fields and stamps updatedBy with the actor', async () => {
      const { service, prisma } = buildService();
      await service.updatePolicy(
        'TIER_2',
        { perTransactionLimit: 7_000_000 },
        'admin-1',
      );

      expect(prisma.transactionLimitPolicy.update).toHaveBeenCalledWith({
        where: { tier: 'TIER_2' },
        data: { perTransactionLimit: 7_000_000, updatedBy: 'admin-1' },
      });
    });
  });
});
