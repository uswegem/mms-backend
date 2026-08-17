import { Injectable } from '@nestjs/common';
import {
  NidaVerificationInput,
  NidaVerificationOutcome,
  NidaVerificationProvider,
} from '../../application/ports/nida-verification.port';

const NIN_RE = /^\d{20}$/;

/**
 * Dev/UAT stand-in for real NIDA connectivity. Tanzania's NIN is 20 digits.
 * Deterministic simulated outcomes via magic suffixes so failure paths are
 * actually testable end-to-end, not just the happy path:
 *   - malformed (not 20 digits) -> NOT_FOUND
 *   - ends in 9999              -> MISMATCH (registered name differs)
 *   - ends in 0000              -> PROVIDER_ERROR (registry unreachable)
 *   - anything else             -> MATCH
 * Swap this class, not its callers, once sandbox credentials exist.
 */
@Injectable()
export class MockNidaVerificationProvider extends NidaVerificationProvider {
  verify(input: NidaVerificationInput): Promise<NidaVerificationOutcome> {
    const nationalId = input.nationalId.trim();

    if (!NIN_RE.test(nationalId)) {
      return Promise.resolve({
        result: 'NOT_FOUND',
        reason:
          'National ID (NIN) must be exactly 20 digits — check for typos or missing digits.',
      });
    }

    if (nationalId.endsWith('9999')) {
      return Promise.resolve({
        result: 'MISMATCH',
        verifiedName: 'MOCK REGISTERED NAME (TEST FIXTURE)',
        reason:
          'The name on this application does not match the name NIDA has on record for this ID.',
      });
    }

    if (nationalId.endsWith('0000')) {
      return Promise.resolve({
        result: 'PROVIDER_ERROR',
        reason:
          'NIDA registry is temporarily unreachable — please retry shortly.',
      });
    }

    return Promise.resolve({
      result: 'MATCH',
      verifiedName: input.expectedFullName,
    });
  }
}
