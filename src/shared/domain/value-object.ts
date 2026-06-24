/**
 * Immutable value object — structural equality.
 */
export abstract class ValueObject {
  equals(other?: ValueObject): boolean {
    if (!other || this.constructor !== other.constructor) return false;
    return JSON.stringify(this) === JSON.stringify(other);
  }
}
