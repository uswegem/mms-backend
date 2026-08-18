import { MockCbsPostingProvider } from './mock-cbs-posting.provider';

describe('MockCbsPostingProvider', () => {
  const provider = new MockCbsPostingProvider();

  it('always succeeds and returns a postingRef/postedAt pair', async () => {
    const result = await provider.postSettlement({
      merchantId: 'merchant-1',
      accountNumber: '0412887144',
      netAmount: '34206.75',
      cycleDate: new Date('2026-08-17'),
      idempotencyKey: 'cycle-1',
    });

    expect(result.postingRef).toMatch(/^CBS-MOCK-/);
    expect(result.postedAt).toBeInstanceOf(Date);
  });

  it('produces a distinct postingRef per call, even for the same idempotencyKey (the mock does not itself dedupe — SettlementsService owns that via cycle status)', async () => {
    const first = await provider.postSettlement({
      merchantId: 'merchant-1',
      accountNumber: '0412887144',
      netAmount: '1000',
      cycleDate: new Date('2026-08-17'),
      idempotencyKey: 'cycle-1',
    });
    const second = await provider.postSettlement({
      merchantId: 'merchant-1',
      accountNumber: '0412887144',
      netAmount: '1000',
      cycleDate: new Date('2026-08-17'),
      idempotencyKey: 'cycle-1',
    });

    expect(first.postingRef).not.toBe(second.postingRef);
  });
});
