export enum ReferenceErrorCode {
  INVALID_FORMAT = 'INVALID_FORMAT',
  BAD_CHECK_DIGIT = 'BAD_CHECK_DIGIT',
  NOT_FOUND = 'NOT_FOUND',
  CANCELLED = 'CANCELLED',
  SETTLED = 'SETTLED',
  SCHOOL_SUSPENDED = 'SCHOOL_SUSPENDED',
  SCHOOL_INACTIVE = 'SCHOOL_INACTIVE',
  NO_OPEN_BALANCE = 'NO_OPEN_BALANCE',
}

export class ReferenceResolutionException extends Error {
  constructor(
    public readonly code: ReferenceErrorCode,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'ReferenceResolutionException';
  }
}
