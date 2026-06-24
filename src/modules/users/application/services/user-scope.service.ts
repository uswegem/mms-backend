import { Injectable } from '@nestjs/common';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import {
  ACQUIRER_LEVEL_ROLES,
  SystemRole,
} from '@infrastructure/auth/rbac/enums/system-role.enum';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { UserForbiddenException } from '../../domain/exceptions/user.exceptions';

@Injectable()
export class UserScopeService {
  hasPermission(actor: ActorContext, permission: Permission): boolean {
    return actor.permissions.includes(permission);
  }

  requirePermission(actor: ActorContext, permission: Permission): void {
    if (!this.hasPermission(actor, permission)) {
      throw new UserForbiddenException();
    }
  }

  isAcquirerLevelActor(actor: ActorContext): boolean {
    return actor.roles.some((r) =>
      ACQUIRER_LEVEL_ROLES.includes(r as SystemRole),
    );
  }

  isMerchantScopedActor(actor: ActorContext): boolean {
    return actor.roles.some((r) =>
      [SystemRole.MERCHANT_ADMIN, SystemRole.SCHOOL_ADMIN].includes(
        r as SystemRole,
      ),
    );
  }

  listFilter(actor: ActorContext): {
    acquirerId: string;
    merchantId?: string;
  } {
    this.requirePermission(actor, Permission.USER_READ);
    if (this.isMerchantScopedActor(actor) && actor.merchantId) {
      return { acquirerId: actor.acquirerId, merchantId: actor.merchantId };
    }
    return { acquirerId: actor.acquirerId };
  }

  assertCanAccessUser(
    actor: ActorContext,
    target: { acquirerId: string; merchantId: string | null },
  ): void {
    if (target.acquirerId !== actor.acquirerId) {
      throw new UserForbiddenException();
    }
    if (this.isMerchantScopedActor(actor) && actor.merchantId) {
      if (target.merchantId !== actor.merchantId) {
        throw new UserForbiddenException(
          'Merchant admins can only access users within their merchant',
        );
      }
    }
  }

  assertCanAssignRoles(
    actor: ActorContext,
    roleCodes: string[],
    targetMerchantId?: string | null,
  ): void {
    this.requirePermission(actor, Permission.USER_ROLE_ASSIGN);

    if (this.isMerchantScopedActor(actor)) {
      const forbidden = roleCodes.filter((code) =>
        ACQUIRER_LEVEL_ROLES.includes(code as SystemRole),
      );
      if (forbidden.length) {
        throw new UserForbiddenException(
          'Merchant admins cannot assign acquirer-level roles',
        );
      }
      if (actor.merchantId && targetMerchantId !== actor.merchantId) {
        throw new UserForbiddenException(
          'Cannot assign roles for users outside your merchant',
        );
      }
    }
  }

  resolveScopeForCreate(
    actor: ActorContext,
    merchantId?: string | null,
  ): { scopeType: string; scopeId: string | null; merchantId: string | null } {
    if (this.isMerchantScopedActor(actor) && actor.merchantId) {
      return {
        scopeType: 'MERCHANT',
        scopeId: actor.merchantId,
        merchantId: actor.merchantId,
      };
    }
    return {
      scopeType: merchantId ? 'MERCHANT' : 'ACQUIRER',
      scopeId: merchantId ?? actor.acquirerId,
      merchantId: merchantId ?? null,
    };
  }
}
