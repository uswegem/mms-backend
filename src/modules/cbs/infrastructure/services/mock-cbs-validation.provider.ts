import { Injectable } from '@nestjs/common';
import {
  CbsValidationOutcome,
  CbsValidationProvider,
} from '../../application/ports/cbs-validation.port';

/**
 * Dev/UAT stand-in — format/plausibility heuristic only (numeric,
 * 10-20 digits, a non-trivial account name), not a real CBS enquiry.
 * Swap this class, not its callers, once real CBS access exists.
 */
@Injectable()
export class MockCbsValidationProvider extends CbsValidationProvider {
  verify(
    accountNumber: string,
    accountName: string,
  ): Promise<CbsValidationOutcome> {
    const normalized = accountNumber.replace(/\s/g, '');
    const pass =
      normalized.length >= 10 &&
      normalized.length <= 20 &&
      /^[0-9]+$/.test(normalized) &&
      accountName.trim().length >= 2;

    return Promise.resolve(
      pass
        ? { result: 'PASS', verifiedAccountName: accountName }
        : { result: 'FAIL' },
    );
  }
}
