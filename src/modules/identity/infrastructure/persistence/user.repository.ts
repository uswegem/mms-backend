import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { AuthUser } from '../../domain/entities/auth-user.entity';

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
