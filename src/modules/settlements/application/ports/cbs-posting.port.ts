export interface CbsPostingResult {
  postingRef: string;
  postedAt: Date;
}

/**
 * CBS function #2 (Scope §3): posting a settled cycle's net amount to the
 * merchant's CBS ledger account — distinct from CBS function #1
 * (settlement-account validation, CbsValidationProvider in the cbs module).
 * Swap for the real CBS posting API once available.
 */
export abstract class CbsPostingProvider {
  abstract postSettlement(input: {
    merchantId: string;
    accountNumber: string;
    netAmount: string;
    cycleDate: Date;
    /**
     * The settlement cycle's own id — a real CBS API call for money
     * movement should be idempotency-protected against a retried call
     * double-posting the same funds. The mock accepts this but doesn't
     * need to enforce dedup itself (it always succeeds and
     * SettlementsService only ever posts a given cycle once via its own
     * status tracking); a real implementation would pass this through to
     * the CBS API's own idempotency-key mechanism.
     */
    idempotencyKey: string;
  }): Promise<CbsPostingResult>;
}
