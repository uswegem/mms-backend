export interface TraVerificationInput {
  tin: string;
  expectedLegalName: string;
}

export interface TraVerificationOutcome {
  result: 'MATCH' | 'MISMATCH' | 'NOT_FOUND' | 'PROVIDER_ERROR';
  /** Name TRA has on record for this TIN, when found. */
  verifiedName?: string;
  /** Actionable, human-readable reason — brief §4.3: "not a generic failure". */
  reason?: string;
  rawResponse?: unknown;
}

/**
 * TRA TIN verification (onboarding Step 3, brief §4.3). Swappable for the
 * real TRA integration once sandbox credentials exist — callers depend
 * only on this interface, never on MockTraVerificationProvider directly.
 */
export abstract class TraVerificationProvider {
  abstract verify(input: TraVerificationInput): Promise<TraVerificationOutcome>;
}
