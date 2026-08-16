import { Injectable } from '@nestjs/common';
import { PasswordAlgo } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { AuthUser } from '../../domain/entities/auth-user.entity';

export interface NotifiableUser {
  id: string;
  email: string;
  fullName: string;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: {
        authCredential: true,
        userRoles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        authCredential: true,
        userRoles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Still-BCRYPT users holding one of `privilegedRoleCodes`, or any
   * permission ending in ":approve" (maker-checker approvers, queried
   * dynamically rather than a hard-coded role list — brief §1.3), who
   * aren't already flagged. Used by the one-time migration-cutover script.
   */
  async findPrivilegedOnBcrypt(
    privilegedRoleCodes: string[],
  ): Promise<NotifiableUser[]> {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        authCredential: {
          passwordAlgo: PasswordAlgo.BCRYPT,
          mustResetPassword: false,
        },
        userRoles: {
          some: {
            role: {
              OR: [
                { code: { in: privilegedRoleCodes } },
                {
                  permissions: {
                    some: { permission: { code: { endsWith: ':approve' } } },
                  },
                },
              ],
            },
          },
        },
      },
      select: { id: true, email: true, fullName: true },
    });
  }

  /** Still-BCRYPT users who haven't been flagged by the 90-day backstop yet. */
  async findBcryptUsersNotFlagged(): Promise<NotifiableUser[]> {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        authCredential: {
          passwordAlgo: PasswordAlgo.BCRYPT,
          mustResetPassword: false,
        },
      },
      select: { id: true, email: true, fullName: true },
    });
  }

  /** Still-BCRYPT users who haven't received the backstop warning email yet. */
  async findBcryptUsersNotWarned(): Promise<NotifiableUser[]> {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        authCredential: {
          passwordAlgo: PasswordAlgo.BCRYPT,
          mustResetPassword: false,
          passwordResetWarnedAt: null,
        },
      },
      select: { id: true, email: true, fullName: true },
    });
  }

  toAuthUser(
    user: NonNullable<Awaited<ReturnType<UserRepository['findById']>>>,
  ): AuthUser {
    const roles = [...new Set(user.userRoles.map((ur) => ur.role.code))];
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.code),
        ),
      ),
    ];
    return new AuthUser({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      acquirerId: user.acquirerId,
      merchantId: user.merchantId,
      status: user.status,
      roles,
      permissions,
    });
  }
}
