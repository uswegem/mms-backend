export interface CbsValidationOutcome {
  result: 'PASS' | 'FAIL';
  /** CBS's name-of-record for the account, when validation passes. */
  verifiedAccountName?: string;
}

/**
 * CBS function #1 (Scope §3, brief §4.3 Step 5): settlement-account
 * validation — distinct from CbsPostingProvider (settlements module,
 * function #2: posting a settled cycle's net amount). Swap for a real CBS
 * enquiry once available; CbsVerificationService owns persisting the
 * result and querying prior verifications, this port only covers the
 * external check itself.
 */
export abstract class CbsValidationProvider {
  abstract verify(
    accountNumber: string,
    accountName: string,
  ): Promise<CbsValidationOutcome>;
}
