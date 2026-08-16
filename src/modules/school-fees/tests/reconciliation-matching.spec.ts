import { MatchGroupStatus, Prisma, ReconciliationClassification, ReconciliationMatchRule } from '@prisma/client';
import { decideMatch } from '../domain/reconciliation-matching';
import {
  classifyMatchGroupStatus,
  exceptionClassificationForGroup,
  exceptionFingerprint,
  amountsConflict,
} from '../domain/exception-case';

const payment = {
  id: 'payment-1',
  gatewayTxnRef: 'GW-1',
  paymentReference: '9000000000001',
  amount: new Prisma.Decimal('100.00'),
  gatewayPaidAt: new Date('2026-08-01T10:00:00Z'),
  mmsReceivedAt: new Date('2026-08-01T10:01:00Z'),
};

describe('reconciliation matching', () => {
  it('prioritizes an exact gateway transaction ID', () => {
    const result = decideMatch(
      {
        externalTxnId: 'GW-1',
        paymentReference: 'other',
        amount: new Prisma.Decimal('99.00'),
        valueDate: new Date(),
      },
      [payment],
      { softDays: 1, hardDays: 3 },
    );
    expect(result).toMatchObject({
      classification: ReconciliationClassification.MATCHED,
      rule: ReconciliationMatchRule.EXACT_TXN_ID,
      paymentId: payment.id,
    });
  });

  it('records an amount mismatch without claiming payment', () => {
    const result = decideMatch(
      {
        externalTxnId: 'EXT-1',
        paymentReference: payment.paymentReference,
        amount: new Prisma.Decimal('90.00'),
        valueDate: new Date(),
      },
      [payment],
      { softDays: 1, hardDays: 3 },
    );
    expect(result).toMatchObject({
      classification: ReconciliationClassification.AMOUNT_MISMATCH,
      rule: ReconciliationMatchRule.REF_AMOUNT_MISMATCH,
      candidatePaymentId: payment.id,
    });
    expect(result.paymentId).toBeUndefined();
  });

  it('auto-matches with soft date variance (±1d)', () => {
    const result = decideMatch(
      {
        externalTxnId: 'EXT-2',
        paymentReference: payment.paymentReference,
        amount: new Prisma.Decimal('100.00'),
        valueDate: new Date('2026-08-02T10:00:00Z'),
      },
      [payment],
      { softDays: 1, hardDays: 3 },
    );
    expect(result.classification).toBe(ReconciliationClassification.MATCHED);
    expect(result.paymentId).toBe(payment.id);
  });

  it('auto MATCHED_WITH_VARIANCE between soft and hard windows', () => {
    const result = decideMatch(
      {
        externalTxnId: 'EXT-3',
        paymentReference: payment.paymentReference,
        amount: new Prisma.Decimal('100.00'),
        valueDate: new Date('2026-08-03T12:00:00Z'),
      },
      [payment],
      { softDays: 1, hardDays: 3 },
    );
    expect(result).toMatchObject({
      classification: ReconciliationClassification.MATCHED_WITH_VARIANCE,
      paymentId: payment.id,
    });
  });

  it('opens DATE_VARIANCE_REVIEW beyond hard window without claiming', () => {
    const result = decideMatch(
      {
        externalTxnId: 'EXT-4',
        paymentReference: payment.paymentReference,
        amount: new Prisma.Decimal('100.00'),
        valueDate: new Date('2026-08-06T10:00:00Z'),
      },
      [payment],
      { softDays: 1, hardDays: 3 },
    );
    expect(result).toMatchObject({
      classification: ReconciliationClassification.DATE_VARIANCE_REVIEW,
      candidatePaymentId: payment.id,
    });
    expect(result.paymentId).toBeUndefined();
  });
});

describe('three-way match groups', () => {
  it('classifies FULLY_MATCHED when all legs present', () => {
    expect(
      classifyMatchGroupStatus([
        { legType: 'MMS' },
        { legType: 'TIPS' },
        { legType: 'CBS' },
      ]),
    ).toBe('FULLY_MATCHED');
  });

  it('maps missing CBS to exception classification', () => {
    expect(exceptionClassificationForGroup(MatchGroupStatus.MMS_TIPS_ONLY)).toBe(
      ReconciliationClassification.MISSING_CBS_LEG,
    );
  });

  it('detects cross-leg amount conflicts', () => {
    expect(
      amountsConflict([new Prisma.Decimal('100.00'), new Prisma.Decimal('100.00'), new Prisma.Decimal('101.00')]),
    ).toBe(true);
  });

  it('dedups exception fingerprints', () => {
    const a = exceptionFingerprint({
      classification: ReconciliationClassification.ORPHAN_TIPS,
      externalIds: ['b', 'a'],
      merchantId: 'm1',
    });
    const b = exceptionFingerprint({
      classification: ReconciliationClassification.ORPHAN_TIPS,
      externalIds: ['a', 'b'],
      merchantId: 'm1',
    });
    expect(a).toBe(b);
  });
});
