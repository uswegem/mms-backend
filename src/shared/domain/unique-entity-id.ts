import { ValueObject } from './value-object';

export class UniqueEntityId extends ValueObject {
  private constructor(readonly value: string) {
    super();
  }

  static create(value: string): UniqueEntityId {
    return new UniqueEntityId(value);
  }

  toString(): string {
    return this.value;
  }
}
