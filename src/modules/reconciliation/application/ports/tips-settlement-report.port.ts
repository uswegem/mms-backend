export interface TipsSettlementReportLine {
  tipsEndToEndId: string;
  amount: string;
}

/**
 * The other side of reconciliation's comparison (design screens: "TIPS
 * settlement report vs internal ledger"). Real TIPS would return its own
 * settlement report for the cycle; the mock mirrors our own successful
 * payments for the same merchant/date, which is why a default dev run
 * matches cleanly — discrepancy scenarios are exercised in tests against a
 * fake implementation, not this adapter's normal behaviour.
 */
export abstract class TipsSettlementReportProvider {
  abstract getSettlementReport(
    merchantId: string,
    cycleDate: Date,
  ): Promise<TipsSettlementReportLine[]>;
}
