import { UserWithRelations } from '../../infrastructure/persistence/users.repository';

export interface UserRoleDto {
  id: string;
  code: string;
  name: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  fullName: string;
  status: string;
  acquirerId: string;
  merchantId: string | null;
  phone: string | null;
  roles: UserRoleDto[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toUserResponse(user: UserWithRelations): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    acquirerId: user.acquirerId,
    merchantId: user.merchantId,
    phone: user.profile?.phone ?? null,
    roles: user.userRoles.map((ur) => ({
      id: ur.role.id,
      code: ur.role.code,
      name: ur.role.name,
    })),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
