import { HttpStatus } from '@nestjs/common';
import { AppException } from '@shared/infrastructure/exceptions/app.exception';
import { ErrorCodes } from '@shared/infrastructure/exceptions/error-codes';

export class ApprovalTaskNotFoundException extends AppException {
  constructor(id: string) {
    super(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND, `Approval task not found: ${id}`, {
      title: 'Not Found',
    });
  }
}

export class ApprovalForbiddenException extends AppException {
  constructor(detail = 'Approval action not permitted') {
    super(ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN, detail, { title: 'Forbidden' });
  }
}

export class ApprovalValidationException extends AppException {
  constructor(detail: string) {
    super(ErrorCodes.BUSINESS_RULE, HttpStatus.UNPROCESSABLE_ENTITY, detail, {
      title: 'Business Rule Violation',
    });
  }
}

export class MakerCheckerViolationException extends AppException {
  constructor() {
    super(
      ErrorCodes.BUSINESS_RULE,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Checker cannot be the same user as the maker',
      { title: 'Maker-Checker Violation' },
    );
  }
}
