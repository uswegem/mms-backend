import { ReconciliationClassification, ReconciliationMatchRule } from '@prisma/client';

export type MatchCandidate = {
  id: string;
  gatewayTxnRef: string;
  paymentReference: string;
  amount: { equals(value: unknown): boolean };
  gatewayPaidAt: Date | null;
  mmsReceivedAt: Date;
};

export type MatchDecision = {
  classification: ReconciliationClassification;
  rule: ReconciliationMatchRule;
  paymentId?: string;
  amountDelta?: number;
  dateDeltaHours?: number;
  candidatePaymentId?: string;
};

export type DateVarianceWindows = {
  softDays: number;
  hardDays: number;
};

/** Hours equivalent for calendar-day windows (inclusive soft/hard). */
function hoursForDays(days: number) {
  return days * 24;
}

/**
 * Two-way MMS↔external decision (4c core, extended for 4d/4e date bands).
 * Soft ±softDays → MATCHED; soft..hard → MATCHED_WITH_VARIANCE; beyond hard → DATE_VARIANCE_REVIEW (candidate only).
 */
export function decideMatch(
  external: {
    externalTxnId: string;
    paymentReference: string | null;
    amount: { equals?(value: unknown): boolean; minus(value: unknown): { toNumber(): number } };
    valueDate: Date;
  },
  payments: MatchCandidate[],
  dateWindowDaysOrWindows: number | DateVarianceWindows,
): MatchDecision {
  const windows: DateVarianceWindows =
    typeof dateWindowDaysOrWindows === 'number'
      ? { softDays: dateWindowDaysOrWindows, hardDays: Math.max(dateWindowDaysOrWindows, 3) }
      : dateWindowDaysOrWindows;

  const exact = payments.find((payment) => payment.gatewayTxnRef === external.externalTxnId);
  if (exact) {
    return {
      classification: ReconciliationClassification.MATCHED,
      rule: ReconciliationMatchRule.EXACT_TXN_ID,
      paymentId: exact.id,
    };
  }

  const sameReference = external.paymentReference
    ? payments.filter((payment) => payment.paymentReference === external.paymentReference)
    : [];
  const sameAmount = sameReference.filter((payment) => payment.amount.equals(external.amount));

  if (sameAmount.length === 1) {
    const payment = sameAmount[0];
    const date = payment.gatewayPaidAt ?? payment.mmsReceivedAt;
    const dateDeltaHours = Math.round((external.valueDate.getTime() - date.getTime()) / 3600000);
    const absHours = Math.abs(dateDeltaHours);
    if (absHours <= hoursForDays(windows.softDays)) {
      return {
        classification: ReconciliationClassification.MATCHED,
        rule: ReconciliationMatchRule.REF_AMOUNT_DATE_WINDOW,
        paymentId: payment.id,
        dateDeltaHours,
      };
    }
    if (absHours <= hoursForDays(windows.hardDays)) {
      return {
        classification: ReconciliationClassification.MATCHED_WITH_VARIANCE,
        rule: ReconciliationMatchRule.REF_AMOUNT_DATE_VARIANCE,
        paymentId: payment.id,
        dateDeltaHours,
      };
    }
    return {
      classification: ReconciliationClassification.DATE_VARIANCE_REVIEW,
      rule: ReconciliationMatchRule.REF_AMOUNT_DATE_VARIANCE,
      dateDeltaHours,
      candidatePaymentId: payment.id,
    };
  }

  if (sameReference.length === 1) {
    const payment = sameReference[0];
    return {
      classification: ReconciliationClassification.AMOUNT_MISMATCH,
      rule: ReconciliationMatchRule.REF_AMOUNT_MISMATCH,
      amountDelta: external.amount.minus(payment.amount).toNumber(),
      candidatePaymentId: payment.id,
    };
  }

  return {
    classification: ReconciliationClassification.UNMATCHED_EXTERNAL,
    rule: ReconciliationMatchRule.NONE,
  };
}
