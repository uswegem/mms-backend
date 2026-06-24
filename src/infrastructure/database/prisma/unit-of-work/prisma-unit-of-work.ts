import { Injectable } from '@nestjs/common';
import { IUnitOfWork } from '@shared/application';
import { PrismaService } from '../prisma.service';

/**
 * Prisma transaction wrapper — implement $transaction usage in domain modules.
 */
@Injectable()
export class PrismaUnitOfWork implements IUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async begin(): Promise<void> {
    // TODO: bind interactive transaction when modules are implemented
  }

  async commit(): Promise<void> {
    // TODO
  }

  async rollback(): Promise<void> {
    // TODO
  }
}
