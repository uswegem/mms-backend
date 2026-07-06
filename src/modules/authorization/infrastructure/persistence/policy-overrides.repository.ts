import { Injectable, NotFoundException } from '@nestjs/common';
import { PolicyEffect, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class PolicyOverridesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(acquirerId: string, userId?: string) {
    const now = new Date();
    return this.prisma.policyOverride.findMany({
      where: {
        acquirerId,
        revokedAt: null,
        ...(userId ? { userId } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
  }

  async create(
    acquirerId: string,
    data: {
      userId: string;
      permissionCode: string;
      effect: PolicyEffect;
      scopeType?: string;
      scopeId?: string;
      reason?: string;
      expiresAt?: Date;
    },
    actorId: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: data.userId, acquirerId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const permission = await this.prisma.permission.findUnique({
      where: { code: data.permissionCode },
    });
    if (!permission) throw new NotFoundException('Permission not found');

    return this.prisma.policyOverride.create({
      data: {
        acquirerId,
        userId: data.userId,
        permissionCode: data.permissionCode,
        effect: data.effect,
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        reason: data.reason,
        expiresAt: data.expiresAt,
        createdBy: actorId,
      },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
  }

  async revoke(acquirerId: string, overrideId: string, actorId: string) {
    const row = await this.prisma.policyOverride.findFirst({
      where: { id: overrideId, acquirerId, revokedAt: null },
    });
    if (!row) throw new NotFoundException('Policy override not found');

    return this.prisma.policyOverride.update({
      where: { id: overrideId },
      data: { revokedAt: new Date(), revokedBy: actorId },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
  }
}
