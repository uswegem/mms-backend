import { SetMetadata } from '@nestjs/common';
import { SystemRole } from '../enums/system-role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: SystemRole[]) => SetMetadata(ROLES_KEY, roles);
