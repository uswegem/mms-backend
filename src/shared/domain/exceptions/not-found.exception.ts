import { DomainException } from './domain.exception';

export class NotFoundDomainException extends DomainException {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND');
    this.name = 'NotFoundDomainException';
  }
}
