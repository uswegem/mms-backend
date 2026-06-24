import { DomainEvent } from './domain-event';

/**
 * DDD aggregate root — collects domain events for dispatch after commit.
 */
export abstract class AggregateRoot<TId> {
  private _domainEvents: DomainEvent[] = [];

  protected constructor(protected readonly id: TId) {}

  get domainEvents(): ReadonlyArray<DomainEvent> {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
