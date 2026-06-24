export class DomainException extends Error {
  constructor(
    message: string,
    readonly code: string = 'DOMAIN_ERROR',
  ) {
    super(message);
    this.name = 'DomainException';
  }
}
