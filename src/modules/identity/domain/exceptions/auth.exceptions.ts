import { HttpStatus } from '@nestjs/common';
import { AppException } from '@shared/infrastructure/exceptions/app.exception';
import { ErrorCodes } from '@shared/infrastructure/exceptions/error-codes';

export class InvalidCredentialsException extends AppException {
  constructor() {
    super(
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
      'Invalid email or password',
      { title: 'Invalid Credentials' },
    );
  }
}

export class AccountLockedException extends AppException {
  constructor(lockoutUntil?: Date) {
    super(
      ErrorCodes.AUTH_ACCOUNT_LOCKED,
      HttpStatus.LOCKED,
      lockoutUntil
        ? `Account is locked until ${lockoutUntil.toISOString()}`
        : 'Account is locked',
      {
        title: 'Account Locked',
        extra: { lockoutUntil: lockoutUntil?.toISOString() },
      },
    );
  }
}

export class MfaRequiredException extends AppException {
  constructor() {
    super(
      ErrorCodes.AUTH_MFA,
      HttpStatus.UNAUTHORIZED,
      'Multi-factor authentication code is required',
      { title: 'MFA Required', extra: { mfaRequired: true } },
    );
  }
}

export class InvalidMfaCodeException extends AppException {
  constructor() {
    super(
      ErrorCodes.AUTH_MFA,
      HttpStatus.UNAUTHORIZED,
      'Invalid multi-factor authentication code',
      { title: 'Invalid MFA Code' },
    );
  }
}

export class InvalidRefreshTokenException extends AppException {
  constructor() {
    super(
      ErrorCodes.UNAUTHORIZED,
      HttpStatus.UNAUTHORIZED,
      'Invalid or expired refresh token',
      { title: 'Unauthorized' },
    );
  }
}

export class InvalidResetTokenException extends AppException {
  constructor() {
    super(
      ErrorCodes.VALIDATION,
      HttpStatus.BAD_REQUEST,
      'Invalid or expired password reset token',
      { title: 'Invalid Reset Token' },
    );
  }
}

/**
 * Credentials were valid, but the account is flagged to reset its password
 * before a session can be issued (brief §1.3 — privileged-account cutover;
 * §1.4 — 90-day backstop). The frontend routes to the forced-reset flow
 * instead of treating this as a normal auth failure.
 */
export class PasswordResetRequiredException extends AppException {
  constructor() {
    super(
      ErrorCodes.AUTH_PASSWORD_RESET_REQUIRED,
      HttpStatus.FORBIDDEN,
      'Password reset is required before you can sign in',
      {
        title: 'Password Reset Required',
        extra: { passwordResetRequired: true },
      },
    );
  }
}

export class UserNotActiveException extends AppException {
  constructor() {
    super(
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
      'Account is not active',
      { title: 'Invalid Credentials' },
    );
  }
}
