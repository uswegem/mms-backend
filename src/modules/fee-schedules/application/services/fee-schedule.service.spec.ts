import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FeeScheduleService } from './fee-schedule.service';

function buildSchedule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'schedule-1',
    version: 1,
    scope: 'DEFAULT',
    scopeKey: null,
    status: 'ACTIVE',
    effectiveFrom: new Date('2026-07-01'),
    supersededAt: null,
    createdBy: 'maker-1',
    createdAt: new Date('2026-06-01'),
    approvedBy: 'checker-1',
    approvedAt: new Date('2026-06-02'),
    charges: [
      {
        id: 'charge-1',
        scheduleId: 'schedule-1',
        chargeType: 'MDR',
        basis: 'PERCENT_OF_TRANSACTION',
        rate: 0.0085,
        flatAmount: null,
        capAmount: 3000,
      },
    ],
    ...overrides,
  };
}

function buildService() {
  const prisma = {
    merchant: { findUnique: jest.fn() },
    feeSchedule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    feeScheduleAcceptance: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );

  const service = new FeeScheduleService(prisma as never);
  return { service, prisma };
}

describe('FeeScheduleService', () => {
  describe('resolveForMerchant', () => {
    it('prefers a MERCHANT-scoped override over MCC and DEFAULT', async () => {
      const { service, prisma } = buildService();
      prisma.merchant.findUnique.mockResolvedValue({ mcc: '5411' });
      const merchantOverride = buildSchedule({
        scope: 'MERCHANT',
        scopeKey: 'merchant-1',
      });
      prisma.feeSchedule.findFirst.mockResolvedValueOnce(merchantOverride);

      const result = await service.resolveForMerchant('merchant-1');

      expect(result).toBe(merchantOverride);
      expect(prisma.feeSchedule.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.feeSchedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            scope: 'MERCHANT',
            scopeKey: 'merchant-1',
            status: 'ACTIVE',
          },
        }),
      );
    });

    it('falls through to the MCC schedule when no merchant override exists', async () => {
      const { service, prisma } = buildService();
      prisma.merchant.findUnique.mockResolvedValue({ mcc: '5411' });
      const mccSchedule = buildSchedule({ scope: 'MCC', scopeKey: '5411' });
      prisma.feeSchedule.findFirst
        .mockResolvedValueOnce(null) // MERCHANT
        .mockResolvedValueOnce(mccSchedule); // MCC

      const result = await service.resolveForMerchant('merchant-1');

      expect(result).toBe(mccSchedule);
    });

    it('falls through to DEFAULT when neither MERCHANT nor MCC schedules exist', async () => {
      const { service, prisma } = buildService();
      prisma.merchant.findUnique.mockResolvedValue({ mcc: '5411' });
      const defaultSchedule = buildSchedule();
      prisma.feeSchedule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(defaultSchedule);

      const result = await service.resolveForMerchant('merchant-1');

      expect(result).toBe(defaultSchedule);
    });

    it('throws when even DEFAULT is missing (seed never ran)', async () => {
      const { service, prisma } = buildService();
      prisma.merchant.findUnique.mockResolvedValue({ mcc: '5411' });
      prisma.feeSchedule.findFirst.mockResolvedValue(null);

      await expect(service.resolveForMerchant('merchant-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when the merchant itself does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.resolveForMerchant('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('rejects a scopeKey on a DEFAULT-scope schedule', async () => {
      const { service } = buildService();
      await expect(
        service.create(
          {
            scope: 'DEFAULT',
            scopeKey: '5411',
            charges: [
              {
                chargeType: 'MDR',
                basis: 'PERCENT_OF_TRANSACTION',
                rate: 0.01,
              },
            ],
          },
          'maker-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires a scopeKey for MCC/MERCHANT scope', async () => {
      const { service } = buildService();
      await expect(
        service.create(
          {
            scope: 'MCC',
            charges: [
              {
                chargeType: 'MDR',
                basis: 'PERCENT_OF_TRANSACTION',
                rate: 0.01,
              },
            ],
          },
          'maker-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires a rate for a PERCENT_OF_TRANSACTION charge', async () => {
      const { service } = buildService();
      await expect(
        service.create(
          {
            scope: 'DEFAULT',
            charges: [{ chargeType: 'MDR', basis: 'PERCENT_OF_TRANSACTION' }],
          },
          'maker-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires a flatAmount for a FLAT_PER_* charge', async () => {
      const { service } = buildService();
      await expect(
        service.create(
          {
            scope: 'DEFAULT',
            charges: [
              { chargeType: 'SETTLEMENT_TRANSFER', basis: 'FLAT_PER_SWEEP' },
            ],
          },
          'maker-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a DRAFT with the next sequential version number', async () => {
      const { service, prisma } = buildService();
      prisma.feeSchedule.count.mockResolvedValue(3);
      prisma.feeSchedule.create.mockResolvedValue(
        buildSchedule({ version: 4, status: 'DRAFT' }),
      );

      await service.create(
        {
          scope: 'DEFAULT',
          charges: [
            { chargeType: 'MDR', basis: 'PERCENT_OF_TRANSACTION', rate: 0.01 },
          ],
        },
        'maker-1',
      );

      const [createCall] = prisma.feeSchedule.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(createCall.data).toMatchObject({
        version: 4,
        status: 'DRAFT',
        createdBy: 'maker-1',
      });
    });
  });

  describe('activate', () => {
    it('rejects activating a schedule that is not DRAFT', async () => {
      const { service, prisma } = buildService();
      prisma.feeSchedule.findUnique.mockResolvedValue(
        buildSchedule({ status: 'ACTIVE' }),
      );

      await expect(service.activate('schedule-1', 'checker-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects the maker activating their own draft', async () => {
      const { service, prisma } = buildService();
      prisma.feeSchedule.findUnique.mockResolvedValue(
        buildSchedule({ status: 'DRAFT', createdBy: 'maker-1' }),
      );

      await expect(service.activate('schedule-1', 'maker-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('supersedes the previously ACTIVE schedule for the same scope', async () => {
      const { service, prisma } = buildService();
      const draft = buildSchedule({
        id: 'schedule-2',
        version: 2,
        status: 'DRAFT',
        createdBy: 'maker-1',
      });
      prisma.feeSchedule.findUnique.mockResolvedValue(draft);
      const previouslyActive = buildSchedule({
        id: 'schedule-1',
        status: 'ACTIVE',
      });
      prisma.feeSchedule.findFirst.mockResolvedValue(previouslyActive);
      prisma.feeSchedule.update.mockResolvedValue(
        buildSchedule({ id: 'schedule-2', status: 'ACTIVE' }),
      );

      await service.activate('schedule-2', 'checker-1');

      type UpdateCall = {
        where: { id: string };
        data: Record<string, unknown>;
      };
      const calls = prisma.feeSchedule.update.mock.calls as [UpdateCall][];
      const supersedeCall = calls.find(([c]) => c.where.id === 'schedule-1');
      const activateCall = calls.find(([c]) => c.where.id === 'schedule-2');

      expect(supersedeCall?.[0].data).toMatchObject({ status: 'SUPERSEDED' });
      expect(activateCall?.[0].data).toMatchObject({
        status: 'ACTIVE',
        approvedBy: 'checker-1',
      });
    });
  });

  describe('recordAcceptance', () => {
    it('upserts on (applicationId, scheduleId) so re-entering the wizard step is idempotent', async () => {
      const { service, prisma } = buildService();
      prisma.feeScheduleAcceptance.upsert.mockResolvedValue({ id: 'acc-1' });

      await service.recordAcceptance(
        'app-1',
        'merchant-1',
        'schedule-1',
        'owner-1',
      );

      expect(prisma.feeScheduleAcceptance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            applicationId_scheduleId: {
              applicationId: 'app-1',
              scheduleId: 'schedule-1',
            },
          },
        }),
      );
    });
  });

  describe('mdrCharge', () => {
    it("finds the MDR line among a schedule's charges", () => {
      const { service } = buildService();
      const schedule = buildSchedule();
      expect(service.mdrCharge(schedule as never)?.chargeType).toBe('MDR');
    });

    it('returns null when the schedule has no MDR line', () => {
      const { service } = buildService();
      const schedule = buildSchedule({ charges: [] });
      expect(service.mdrCharge(schedule as never)).toBeNull();
    });
  });
});
