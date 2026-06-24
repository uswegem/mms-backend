import { HttpStatus } from '@nestjs/common';
import { AppException } from '@shared/infrastructure/exceptions/app.exception';
import { ErrorCodes } from '@shared/infrastructure/exceptions/error-codes';

export class UserNotFoundException extends AppException {
  constructor(id: string) {
    super(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND, `User not found: ${id}`, {
      title: 'Not Found',
    });
  }
}

export class UserForbiddenException extends AppException {
  constructor(detail = 'You do not have permission to perform this action') {
    super(ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN, detail, {
      title: 'Forbidden',
    });
  }
}

export class UserConflictException extends AppException {
  constructor(detail: string) {
    super(ErrorCodes.CONFLICT, HttpStatus.CONFLICT, detail, { title: 'Conflict' });
  }
}

export class UserValidationException extends AppException {
  constructor(detail: string) {
    super(ErrorCodes.BUSINESS_RULE, HttpStatus.UNPROCESSABLE_ENTITY, detail, {
      title: 'Business Rule Violation',
    });
  }
}
