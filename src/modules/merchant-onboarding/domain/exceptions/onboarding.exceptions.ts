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
    super(ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN, detail, { title: 'Forbidden' });
  }
}

export class OnboardingValidationException extends AppException {
  constructor(detail: string) {
    super(ErrorCodes.BUSINESS_RULE, HttpStatus.UNPROCESSABLE_ENTITY, detail, {
      title: 'Validation Failed',
    });
  }
}
