export interface TpsRegistrationRequest {
  merchantId: string;
  legalName: string;
  tradingName: string;
  mcc: string;
  taxId?: string | null;
  /**
   * Dev/test-only override to exercise the rejection path deterministically.
   * Explicit and typed, not a hidden string match against business data
   * (trading/legal name) — the previous implementation simulated failure
   * whenever tradingName/legalName contained "TIPS_FAIL"/"TPS_FAIL", which
   * meant a real merchant legitimately named that way would silently fail
   * TIPS registration in production. Removed; this replaces it.
   */
  simulateOutcome?: 'FAIL';
}

export interface TpsRegistrationResult {
  success: boolean;
  tpsMerchantId?: string;
  referenceId?: string;
  failureReason?: string;
  responsePayload: Record<string, unknown>;
}

/**
 * TIPS directory registration (onboarding Step 9 precursor — brief §4.3).
 * Distinct from TipsPaymentProvider (transactions module, inbound payment
 * confirmation) — this is outbound merchant registration with TIPS.
 * Swappable for the real BOT/TIPS integration once sandbox access exists;
 * callers depend only on this interface.
 */
export abstract class TpsRegistrationProvider {
  abstract registerMerchant(
    request: TpsRegistrationRequest,
    idempotencyKey: string,
    actorId: string,
  ): Promise<TpsRegistrationResult>;
}
