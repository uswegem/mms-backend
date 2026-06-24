/**
 * Unit of Work port — implemented by Prisma adapter in infrastructure.
 */
export interface IUnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
