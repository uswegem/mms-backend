import { PaymentStatus } from '@prisma/client';
import { PaymentTimeoutReconciliationJob } from './payment-timeout-reconciliation.job';

describe('PaymentTimeoutReconciliationJob — §4.5 retry/timeout handling', () => {
  function buildJob(stuck: Array<{ id: string; tipsEndToEndId: string }>) {
    const transactions = {
      findStuckInitiated: jest.fn().mockResolvedValue(stuck),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const tips = { queryPaymentStatus: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(10) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const job = new PaymentTimeoutReconciliationJob(
      transactions as never,
      tips as never,
      config as never,
      audit as never,
    );
    return { job, transactions, tips };
  }

  it('resolves a stuck payment TIPS reports as SUCCESS', async () => {
    const { job, transactions, tips } = buildJob([
      { id: 'p1', tipsEndToEndId: 'T1' },
    ]);
    tips.queryPaymentStatus.mockResolvedValue({
      status: 'SUCCESS',
      tipsSettledAt: new Date(),
    });

    await job.run();

    expect(transactions.updateStatus).toHaveBeenCalledWith(
      'p1',
      PaymentStatus.SUCCESS,
      expect.any(Date),
    );
  });

  it('resolves a stuck payment TIPS reports as FAILED', async () => {
    const { job, transactions, tips } = buildJob([
      { id: 'p1', tipsEndToEndId: 'T1' },
    ]);
    tips.queryPaymentStatus.mockResolvedValue({ status: 'FAILED' });

    await job.run();

    expect(transactions.updateStatus).toHaveBeenCalledWith(
      'p1',
      PaymentStatus.FAILED,
      undefined,
    );
  });

  it('leaves a still-PENDING payment alone — retried on the next run, not force-resolved', async () => {
    const { job, transactions, tips } = buildJob([
      { id: 'p1', tipsEndToEndId: 'T1' },
    ]);
    tips.queryPaymentStatus.mockResolvedValue({ status: 'PENDING' });

    await job.run();

    expect(transactions.updateStatus).not.toHaveBeenCalled();
  });

  it('leaves an UNKNOWN-status payment alone too', async () => {
    const { job, transactions, tips } = buildJob([
      { id: 'p1', tipsEndToEndId: 'T1' },
    ]);
    tips.queryPaymentStatus.mockResolvedValue({ status: 'UNKNOWN' });

    await job.run();

    expect(transactions.updateStatus).not.toHaveBeenCalled();
  });
});
