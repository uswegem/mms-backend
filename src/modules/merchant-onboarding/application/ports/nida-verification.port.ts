export interface NidaVerificationInput {
  nationalId: string;
  expectedFullName: string;
}

export interface NidaVerificationOutcome {
  result: 'MATCH' | 'MISMATCH' | 'NOT_FOUND' | 'PROVIDER_ERROR';
  /** Name NIDA has on record for this ID, when found. */
  verifiedName?: string;
  /** Actionable, human-readable reason — brief §4.3: "not a generic failure". */
  reason?: string;
  rawResponse?: unknown;
}

/**
 * NIDA verification (onboarding Step 2, brief §4.3). Swappable for the
 * real NIDA integration once sandbox credentials exist — callers depend
 * only on this interface, never on MockNidaVerificationProvider directly.
 */
export abstract class NidaVerificationProvider {
  abstract verify(
    input: NidaVerificationInput,
  ): Promise<NidaVerificationOutcome>;
}
