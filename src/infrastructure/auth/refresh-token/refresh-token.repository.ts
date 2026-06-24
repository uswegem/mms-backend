import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

/**
 * Persistence for refresh_tokens table — implement CRUD when auth flows are added.
 */
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: create, findByTokenHash, revokeByUserId
}
