import { HttpStatus } from '@nestjs/common';
import { AppException } from '@shared/infrastructure/exceptions/app.exception';
import { ErrorCodes } from '@shared/infrastructure/exceptions/error-codes';

export class InvalidLocationException extends AppException {
  constructor(detail: string) {
    super(ErrorCodes.VALIDATION, HttpStatus.BAD_REQUEST, detail, {
      title: 'Invalid Location',
    });
  }
}

export class InvalidBankCodeException extends AppException {
  constructor(bankCode: string) {
    super(
      ErrorCodes.VALIDATION,
      HttpStatus.BAD_REQUEST,
      `Unknown bank SWIFT code: ${bankCode}`,
      { title: 'Invalid Bank Code' },
    );
  }
}
