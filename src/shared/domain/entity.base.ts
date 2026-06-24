/**
 * Base entity — identity equality by id within aggregate boundary.
 */
export abstract class Entity<TId> {
  protected constructor(protected readonly id: TId) {}

  equals(other?: Entity<TId>): boolean {
    if (!other) return false;
    return this.id === other.id;
  }
}
