export interface CbsPostingResult {
  postingRef: string;
  postedAt: Date;
}

/**
 * CBS function #2 (Scope §3): posting a settled cycle's net amount to the
 * merchant's CBS ledger account — distinct from CBS function #1
 * (settlement-account validation, already covered by CbsVerificationService
 * in the cbs module). Swap for the real CBS posting API once available.
 */
export abstract class CbsPostingProvider {
  abstract postSettlement(input: {
    merchantId: string;
    accountNumber: string;
    netAmount: string;
    cycleDate: Date;
  }): Promise<CbsPostingResult>;
}
