import { ReconciliationExceptionType } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService — ledger vs TIPS settlement report matching', () => {
  const merchantId = 'merchant-1';
  const cycleDate = new Date('2026-08-13');

  function buildService(
    ledger: Array<{ id: string; tipsEndToEndId: string; amount: number }>,
    report: Array<{ tipsEndToEndId: string; amount: string }>,
  ) {
    const reconciliation = {
      findSuccessPayments: jest.fn().mockResolvedValue(ledger),
      replaceOpenExceptions: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      resolve: jest.fn(),
    };
    const tipsReport = {
      getSettlementReport: jest.fn().mockResolvedValue(report),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new ReconciliationService(
      reconciliation as never,
      tipsReport,
      audit as never,
    );
    return { service, reconciliation };
  }

  it('finds no exceptions when the ledger and TIPS report agree exactly', async () => {
    const ledger = [{ id: 'p1', tipsEndToEndId: 'T1', amount: 100 }];
    const report = [{ tipsEndToEndId: 'T1', amount: '100' }];
    const { service, reconciliation } = buildService(ledger, report);

    const summary = await service.runMatch(merchantId, cycleDate);

    expect(summary).toEqual({
      merchantId,
      cycleDate,
      matched: 1,
      exceptions: 0,
    });
    expect(reconciliation.replaceOpenExceptions).toHaveBeenCalledWith(
      merchantId,
      cycleDate,
      [],
    );
  });

  it('raises UNMATCHED_IN_REPORT for a report line with no ledger counterpart', async () => {
    const ledger: never[] = [];
    const report = [{ tipsEndToEndId: 'T1', amount: '64000' }];
    const { service, reconciliation } = buildService(ledger, report);

    await service.runMatch(merchantId, cycleDate);

    expect(reconciliation.replaceOpenExceptions).toHaveBeenCalledWith(
      merchantId,
      cycleDate,
      [
        expect.objectContaining({
          type: ReconciliationExceptionType.UNMATCHED_IN_REPORT,
          tipsEndToEndId: 'T1',
        }),
      ],
    );
  });

  it('raises UNMATCHED_IN_LEDGER for a ledger entry with no report counterpart', async () => {
    const ledger = [{ id: 'p1', tipsEndToEndId: 'T1', amount: 12500 }];
    const report: never[] = [];
    const { service, reconciliation } = buildService(ledger, report);

    await service.runMatch(merchantId, cycleDate);

    expect(reconciliation.replaceOpenExceptions).toHaveBeenCalledWith(
      merchantId,
      cycleDate,
      [
        expect.objectContaining({
          type: ReconciliationExceptionType.UNMATCHED_IN_LEDGER,
          tipsEndToEndId: 'T1',
        }),
      ],
    );
  });

  it('raises DUPLICATE_REFERENCE when the same reference appears twice in the report', async () => {
    const ledger = [{ id: 'p1', tipsEndToEndId: 'T1', amount: 9000 }];
    const report = [
      { tipsEndToEndId: 'T1', amount: '9000' },
      { tipsEndToEndId: 'T1', amount: '9000' },
    ];
    const { service, reconciliation } = buildService(ledger, report);

    await service.runMatch(merchantId, cycleDate);

    const [, , exceptions] = reconciliation.replaceOpenExceptions.mock
      .calls[0] as [string, Date, Array<{ type: string }>];
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe(
      ReconciliationExceptionType.DUPLICATE_REFERENCE,
    );
  });

  it('replaces the prior OPEN set rather than appending — a re-run is idempotent', async () => {
    const ledger = [{ id: 'p1', tipsEndToEndId: 'T1', amount: 100 }];
    const report = [{ tipsEndToEndId: 'T1', amount: '100' }];
    const { service, reconciliation } = buildService(ledger, report);

    await service.runMatch(merchantId, cycleDate);
    await service.runMatch(merchantId, cycleDate);

    expect(reconciliation.replaceOpenExceptions).toHaveBeenCalledTimes(2);
  });

  it('resolves an exception and stamps who/when', async () => {
    const { service, reconciliation } = buildService([], []);
    reconciliation.findById.mockResolvedValue({ id: 'exc-1', status: 'OPEN' });
    reconciliation.resolve.mockResolvedValue({
      id: 'exc-1',
      status: 'RESOLVED',
    });

    await service.resolve('exc-1', 'RESOLVED', 'matched manually', 'user-1');

    expect(reconciliation.resolve).toHaveBeenCalledWith(
      'exc-1',
      'RESOLVED',
      'matched manually',
      'user-1',
    );
  });
});
