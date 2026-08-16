import { Prisma, SettlementCycleStatus } from '@prisma/client';
import { SettlementsService } from './settlements.service';

interface CreatedCycleCall {
  grossAmount: Prisma.Decimal;
  mdrAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  status: SettlementCycleStatus;
}

describe('SettlementsService — sweep + CBS posting', () => {
  const cycleDate = new Date('2026-08-15');

  function buildService(
    opts: {
      merchantIds?: string[];
      payments?: Array<{ id: string; amount: number }>;
      mdrOverride?: number;
      settlementAccount?: { id: string; accountNumber: string } | null;
      cbsShouldFail?: boolean;
    } = {},
  ) {
    const merchantIds = opts.merchantIds ?? ['merchant-1'];
    const payments = opts.payments ?? [
      { id: 'p1', amount: 28000 },
      { id: 'p2', amount: 6500 },
    ];
    const settlementAccount =
      opts.settlementAccount === undefined
        ? { id: 'acc-1', accountNumber: '0412887144' }
        : opts.settlementAccount;

    const settlements = {
      findMerchantIdsWithUnsweptPayments: jest
        .fn()
        .mockResolvedValue(merchantIds),
      findUnsweptPayments: jest.fn().mockResolvedValue(payments),
      findMerchantForSettlement: jest.fn().mockResolvedValue({
        id: 'merchant-1',
        settlementConfig:
          opts.mdrOverride !== undefined ? { mdr: opts.mdrOverride } : null,
        settlementAccounts: settlementAccount ? [settlementAccount] : [],
      }),
      createCycleWithPayments: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ id: 'cycle-1', ...data }),
        ),
      findById: jest.fn().mockImplementation(() =>
        Promise.resolve({
          id: 'cycle-1',
          merchantId: 'merchant-1',
          netAmount: new Prisma.Decimal('34206.28'),
          cycleDate,
        }),
      ),
      markPosted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(),
    };
    const cbs = {
      postSettlement: opts.cbsShouldFail
        ? jest.fn().mockRejectedValue(new Error('CBS unreachable'))
        : jest.fn().mockResolvedValue({
            postingRef: 'CBS-MOCK-1',
            postedAt: new Date(),
          }),
    };
    const config = { get: jest.fn().mockReturnValue(0.0085) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new SettlementsService(
      settlements as never,
      cbs,
      config as never,
      audit as never,
    );
    return { service, settlements, cbs };
  }

  it('sums gross across unswept payments and applies the default MDR when no merchant override exists', async () => {
    const { service, settlements } = buildService();
    await service.sweepAndPost(cycleDate);

    const [call] = settlements.createCycleWithPayments.mock.calls[0] as [
      CreatedCycleCall,
    ];
    expect(call.grossAmount.toString()).toBe('34500'); // 28000 + 6500
    expect(call.mdrAmount.toString()).toBe('293.25'); // 34500 * 0.0085
    expect(call.netAmount.toString()).toBe('34206.75');
    expect(call.status).toBe(SettlementCycleStatus.SWEPT);
  });

  it('uses the merchant-specific MDR override instead of the platform default', async () => {
    const { service, settlements } = buildService({ mdrOverride: 0.01 });
    await service.sweepAndPost(cycleDate);

    const [call] = settlements.createCycleWithPayments.mock.calls[0] as [
      CreatedCycleCall,
    ];
    expect(call.mdrAmount.toString()).toBe('345'); // 34500 * 0.01
  });

  it('links every unswept payment to the new cycle', async () => {
    const { service, settlements } = buildService();
    await service.sweepAndPost(cycleDate);

    expect(settlements.createCycleWithPayments).toHaveBeenCalledWith(
      expect.anything(),
      ['p1', 'p2'],
    );
  });

  it('posts to CBS and marks the cycle POSTED on success', async () => {
    const { service, settlements, cbs } = buildService();
    await service.sweepAndPost(cycleDate);

    expect(cbs.postSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'merchant-1',
        accountNumber: '0412887144',
      }),
    );
    expect(settlements.markPosted).toHaveBeenCalledWith(
      'cycle-1',
      'CBS-MOCK-1',
      expect.any(Date),
    );
  });

  it('marks the cycle FAILED (not POSTED) when there is no verified settlement account', async () => {
    const { service, settlements, cbs } = buildService({
      settlementAccount: null,
    });
    await service.sweepAndPost(cycleDate);

    expect(cbs.postSettlement).not.toHaveBeenCalled();
    expect(settlements.markFailed).toHaveBeenCalledWith(
      'cycle-1',
      expect.stringContaining('settlement account'),
    );
  });

  it('marks the cycle FAILED when CBS posting itself throws', async () => {
    const { service, settlements } = buildService({ cbsShouldFail: true });
    await service.sweepAndPost(cycleDate);

    expect(settlements.markFailed).toHaveBeenCalledWith(
      'cycle-1',
      'CBS unreachable',
    );
  });

  it('skips a merchant with no unswept payments without throwing', async () => {
    const { service, settlements } = buildService();
    settlements.findUnsweptPayments.mockResolvedValue([]);

    const summary = await service.sweepAndPost(cycleDate);

    expect(settlements.createCycleWithPayments).not.toHaveBeenCalled();
    expect(summary).toEqual({ swept: 1, posted: 0, failed: 1 });
  });
});
