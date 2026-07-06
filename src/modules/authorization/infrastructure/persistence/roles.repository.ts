import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(acquirerId: string) {
    return this.prisma.role.findMany({
      where: { acquirerId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(acquirerId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, acquirerId, deletedAt: null },
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permission: { code: 'asc' } },
        },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(
    acquirerId: string,
    data: { code: string; name: string },
    actorId: string,
  ) {
    const code = data.code.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const existing = await this.prisma.role.findFirst({
      where: { acquirerId, code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Role code ${code} already exists`);
    }
    return this.prisma.role.create({
      data: {
        acquirerId,
        code,
        name: data.name,
        isSystem: false,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  async update(
    acquirerId: string,
    roleId: string,
    data: { name?: string },
    actorId: string,
  ) {
    const role = await this.findById(acquirerId, roleId);
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified');
    }
    return this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        updatedBy: actorId,
      },
    });
  }

  async softDelete(acquirerId: string, roleId: string, actorId: string) {
    const role = await this.findById(acquirerId, roleId);
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted');
    }
    if (role._count.userRoles > 0) {
      throw new ConflictException('Role is assigned to users and cannot be deleted');
    }
    return this.prisma.role.update({
      where: { id: roleId },
      data: { deletedAt: new Date(), deletedBy: actorId },
    });
  }

  async setPermissions(
    acquirerId: string,
    roleId: string,
    permissionCodes: string[],
  ) {
    const role = await this.findById(acquirerId, roleId);
    if (role.isSystem) {
      throw new ForbiddenException('System role permissions cannot be changed');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    if (permissions.length !== permissionCodes.length) {
      throw new NotFoundException('One or more permissions are invalid');
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId,
          permissionId: p.id,
        })),
      }),
    ]);

    return this.findById(acquirerId, roleId);
  }
}
