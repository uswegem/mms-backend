import { HttpStatus } from '@nestjs/common';
import { AppException } from '@shared/infrastructure/exceptions/app.exception';
import { ErrorCodes } from '@shared/infrastructure/exceptions/error-codes';

export class MerchantNotFoundException extends AppException {
  constructor(id: string) {
    super(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND, `Merchant not found: ${id}`, {
      title: 'Not Found',
    });
  }
}

export class MerchantForbiddenException extends AppException {
  constructor(detail = 'You do not have permission to perform this action') {
    super(ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN, detail, {
      title: 'Forbidden',
    });
  }
}

export class MerchantConflictException extends AppException {
  constructor(detail: string) {
    super(ErrorCodes.CONFLICT, HttpStatus.CONFLICT, detail, { title: 'Conflict' });
  }
}

export class MerchantValidationException extends AppException {
  constructor(detail: string) {
    super(ErrorCodes.BUSINESS_RULE, HttpStatus.UNPROCESSABLE_ENTITY, detail, {
      title: 'Business Rule Violation',
    });
  }
}
