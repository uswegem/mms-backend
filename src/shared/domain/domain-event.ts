import { randomUUID } from 'crypto';

export abstract class DomainEvent {
  readonly eventId: string = randomUUID();
  readonly occurredAt: Date = new Date();

  abstract readonly eventName: string;
}
