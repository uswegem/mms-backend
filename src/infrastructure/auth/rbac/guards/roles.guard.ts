import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SystemRole } from '../enums/system-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces @Roles() — wire user.roles when identity module is implemented.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<SystemRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest<{
      user?: { roles?: string[] };
    }>();
    if (!user?.roles?.length) return false;
    return requiredRoles.some((role) => user.roles!.includes(role));
  }
}
