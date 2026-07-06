import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { REDIS_CLIENT } from '@infrastructure/cache/redis.constants';

export const RBAC_CACHE_TTL_SECONDS = 300;

export interface EffectivePermissionsResult {
  permissions: string[];
  rolePermissions: string[];
  allowedOverrides: string[];
  deniedPermissions: string[];
  roles: string[];
  storeIds: string[];
  terminalIds: string[];
}

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  private cacheKey(userId: string): string {
    return `rbac:effective:${userId}`;
  }

  async invalidateUser(userId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(this.cacheKey(userId));
  }

  async invalidateRole(roleId: string): Promise<void> {
    const assignments = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    await Promise.all(assignments.map((a) => this.invalidateUser(a.userId)));
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return [...new Set(userRoles.map((ur) => ur.role.code))];
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const effective = await this.getEffectivePermissions(userId);
    return effective.permissions;
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId);
    return effective.permissions.includes(permission);
  }

  async getEffectivePermissions(
    userId: string,
  ): Promise<EffectivePermissionsResult> {
    if (this.redis) {
      const cached = await this.redis.get(this.cacheKey(userId));
      if (cached) {
        return JSON.parse(cached) as EffectivePermissionsResult;
      }
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    const roles = [...new Set(userRoles.map((ur) => ur.role.code))];
    const rolePermissions = [
      ...new Set(
        userRoles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    const now = new Date();
    const overrides = await this.prisma.policyOverride.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    const effective = new Set(rolePermissions);
    const allowedOverrides: string[] = [];
    const deniedPermissions: string[] = [];

    for (const override of overrides) {
      if (override.effect === 'ALLOW') {
        effective.add(override.permissionCode);
        allowedOverrides.push(override.permissionCode);
      } else {
        effective.delete(override.permissionCode);
        deniedPermissions.push(override.permissionCode);
      }
    }

    const storeIds = [
      ...new Set(
        userRoles
          .filter((ur) => ur.scopeType === 'STORE' && ur.scopeId)
          .map((ur) => ur.scopeId!),
      ),
    ];

    const terminalIds = [
      ...new Set(
        userRoles
          .filter((ur) => ur.scopeType === 'TERMINAL' && ur.scopeId)
          .map((ur) => ur.scopeId!),
      ),
    ];

    const result: EffectivePermissionsResult = {
      permissions: [...effective],
      rolePermissions,
      allowedOverrides,
      deniedPermissions,
      roles,
      storeIds,
      terminalIds,
    };

    if (this.redis) {
      await this.redis.setex(
        this.cacheKey(userId),
        RBAC_CACHE_TTL_SECONDS,
        JSON.stringify(result),
      );
    }

    return result;
  }
}
