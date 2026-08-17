import { Injectable } from '@nestjs/common';
import {
  TraVerificationInput,
  TraVerificationOutcome,
  TraVerificationProvider,
} from '../../application/ports/tra-verification.port';

const TIN_RE = /^\d{9}$/;

/**
 * Dev/UAT stand-in for real TRA connectivity. TRA's TIN is 9 digits.
 * Deterministic simulated outcomes via magic suffixes, mirroring
 * MockNidaVerificationProvider's approach:
 *   - malformed (not 9 digits) -> NOT_FOUND
 *   - ends in 999               -> MISMATCH (registered name differs)
 *   - ends in 000                -> PROVIDER_ERROR (registry unreachable)
 *   - anything else              -> MATCH
 * Swap this class, not its callers, once sandbox credentials exist.
 */
@Injectable()
export class MockTraVerificationProvider extends TraVerificationProvider {
  verify(input: TraVerificationInput): Promise<TraVerificationOutcome> {
    const tin = input.tin.trim();

    if (!TIN_RE.test(tin)) {
      return Promise.resolve({
        result: 'NOT_FOUND',
        reason:
          'TIN must be exactly 9 digits — check for typos or missing digits.',
      });
    }

    if (tin.endsWith('999')) {
      return Promise.resolve({
        result: 'MISMATCH',
        verifiedName: 'MOCK REGISTERED ENTITY (TEST FIXTURE)',
        reason:
          'The legal name on this application does not match the name TRA has on record for this TIN.',
      });
    }

    if (tin.endsWith('000')) {
      return Promise.resolve({
        result: 'PROVIDER_ERROR',
        reason:
          'TRA registry is temporarily unreachable — please retry shortly.',
      });
    }

    return Promise.resolve({
      result: 'MATCH',
      verifiedName: input.expectedLegalName,
    });
  }
}
