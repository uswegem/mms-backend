import { Injectable } from '@nestjs/common';
import { PasswordAlgo, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

/** Supabase pooler latency — avoid default 5s interactive transaction timeout */
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const userInclude = {
  profile: true,
  userRoles: {
    include: {
      role: true,
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithRelations = Prisma.UserGetPayload<{
  include: typeof userInclude;
}>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filter: { acquirerId: string; merchantId?: string },
    page: number,
    limit: number,
  ) {
    const where: Prisma.UserWhereInput = {
      acquirerId: filter.acquirerId,
      deletedAt: null,
      ...(filter.merchantId ? { merchantId: filter.merchantId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude,
    });
  }

  async findByEmail(acquirerId: string, email: string) {
    return this.prisma.user.findFirst({
      where: { acquirerId, email: email.toLowerCase(), deletedAt: null },
    });
  }

  /** Includes soft-deleted users (email uniquely constrained per acquirer). */
  async findByEmailIncludingDeleted(acquirerId: string, email: string) {
    return this.prisma.user.findFirst({
      where: { acquirerId, email: email.toLowerCase() },
      include: userInclude,
    });
  }

  async create(data: {
    acquirerId: string;
    email: string;
    fullName: string;
    merchantId?: string | null;
    status: UserStatus;
    createdBy: string;
    roleIds: string[];
    scopeType: string;
    scopeId: string | null;
    passwordHash: string;
    phone?: string;
  }): Promise<UserWithRelations> {
    return this.prisma.$transaction(
      async (tx) =>
        tx.user.create({
          data: {
            acquirerId: data.acquirerId,
            email: data.email.toLowerCase(),
            fullName: data.fullName,
            merchantId: data.merchantId,
            status: data.status,
            createdBy: data.createdBy,
            profile: { create: { phone: data.phone } },
            // PasswordHasherService.hash() always produces Argon2id — set
            // the algo column explicitly rather than relying on its BCRYPT
            // schema default, which exists only to correctly describe rows
            // that predate this migration.
            authCredential: {
              create: {
                passwordHash: data.passwordHash,
                passwordAlgo: PasswordAlgo.ARGON2ID,
              },
            },
            userRoles: {
              create: data.roleIds.map((roleId) => ({
                roleId,
                scopeType: data.scopeType,
                scopeId: data.scopeId,
                createdBy: data.createdBy,
              })),
            },
          },
          include: userInclude,
        }),
      TX_OPTIONS,
    );
  }

  /**
   * Re-open a soft-deleted / inactive user with the same email (unique key).
   * Resets password, roles, and clears deletedAt.
   */
  async reactivate(
    userId: string,
    data: {
      fullName: string;
      merchantId?: string | null;
      status: UserStatus;
      updatedBy: string;
      roleIds: string[];
      scopeType: string;
      scopeId: string | null;
      passwordHash: string;
      phone?: string;
    },
  ): Promise<UserWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.authCredential.upsert({
        where: { userId },
        update: {
          passwordHash: data.passwordHash,
          passwordAlgo: PasswordAlgo.ARGON2ID,
          mustResetPassword: false,
        },
        create: {
          userId,
          passwordHash: data.passwordHash,
          passwordAlgo: PasswordAlgo.ARGON2ID,
        },
      });

      await tx.userProfile.upsert({
        where: { userId },
        update: { phone: data.phone },
        create: { userId, phone: data.phone },
      });

      if (data.roleIds.length) {
        await tx.userRole.createMany({
          data: data.roleIds.map((roleId) => ({
            userId,
            roleId,
            scopeType: data.scopeType,
            scopeId: data.scopeId,
            createdBy: data.updatedBy,
          })),
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          fullName: data.fullName,
          merchantId: data.merchantId,
          status: data.status,
          deletedAt: null,
          deletedBy: null,
          updatedBy: data.updatedBy,
        },
        include: userInclude,
      });
    }, TX_OPTIONS);
  }

  async update(
    id: string,
    data: { fullName?: string; phone?: string; updatedBy: string },
  ): Promise<UserWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      if (data.phone !== undefined) {
        await tx.userProfile.upsert({
          where: { userId: id },
          update: { phone: data.phone },
          create: { userId: id, phone: data.phone },
        });
      }
      return tx.user.update({
        where: { id },
        data: {
          ...(data.fullName ? { fullName: data.fullName } : {}),
          updatedBy: data.updatedBy,
        },
        include: userInclude,
      });
    }, TX_OPTIONS);
  }

  async deactivate(id: string, actorId: string): Promise<UserWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const [, user] = await Promise.all([
        tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        tx.user.update({
          where: { id },
          data: {
            status: 'INACTIVE',
            deletedAt: new Date(),
            deletedBy: actorId,
            updatedBy: actorId,
          },
          include: userInclude,
        }),
      ]);
      return user;
    }, TX_OPTIONS);
  }

  async assignRoles(
    userId: string,
    roleIds: string[],
    scopeType: string,
    scopeId: string | null,
    actorId: string,
  ): Promise<UserWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId,
            roleId,
            scopeType,
            scopeId,
            createdBy: actorId,
          })),
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: userInclude,
      });
    }, TX_OPTIONS);
  }

  async createInvitation(data: {
    acquirerId: string;
    email: string;
    roleId: string;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: string;
  }) {
    return this.prisma.userInvitation.create({ data });
  }

  async findRolesByIds(roleIds: string[], acquirerId: string) {
    return this.prisma.role.findMany({
      where: {
        id: { in: roleIds },
        acquirerId,
        deletedAt: null,
      },
    });
  }

  async findRoleById(roleId: string, acquirerId: string) {
    return this.prisma.role.findFirst({
      where: { id: roleId, acquirerId, deletedAt: null },
    });
  }
}
