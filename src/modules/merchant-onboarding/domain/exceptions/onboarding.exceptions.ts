import { HttpStatus } from '@nestjs/common';
import { AppException } from '@shared/infrastructure/exceptions/app.exception';
import { ErrorCodes } from '@shared/infrastructure/exceptions/error-codes';

export class OnboardingNotFoundException extends AppException {
  constructor(id: string) {
    super(
      ErrorCodes.NOT_FOUND,
      HttpStatus.NOT_FOUND,
      `Onboarding application not found: ${id}`,
      { title: 'Not Found' },
    );
  }
}

export class OnboardingForbiddenException extends AppException {
  constructor(detail = 'Onboarding action not permitted') {
    super(ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN, detail, {
      title: 'Forbidden',
    });
  }
}

export class OnboardingValidationException extends AppException {
  constructor(detail: string) {
    super(ErrorCodes.BUSINESS_RULE, HttpStatus.UNPROCESSABLE_ENTITY, detail, {
      title: 'Validation Failed',
    });
  }
}

/**
 * Brief §4.3: NIDA/TRA verification failure "should return a clear,
 * actionable error at that step ... and let the applicant correct and
 * resubmit rather than getting stuck." Carries the structured result type
 * and reason as `extra` so the frontend can render a specific correction
 * prompt, not just a generic error string.
 */
export class IdentityVerificationFailedException extends AppException {
  constructor(source: 'NIDA' | 'TRA', result: string, reason: string) {
    super(ErrorCodes.BUSINESS_RULE, HttpStatus.UNPROCESSABLE_ENTITY, reason, {
      title: `${source} Verification Failed`,
      extra: { source, result },
    });
  }
}
