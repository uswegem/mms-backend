import { Injectable } from '@nestjs/common';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import {
  MERCHANT_LEVEL_ROLES,
  SystemRole,
} from '@infrastructure/auth/rbac/enums/system-role.enum';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { MerchantForbiddenException } from '../../domain/exceptions/merchant.exceptions';

@Injectable()
export class MerchantScopeService {
  hasPermission(actor: ActorContext, permission: Permission): boolean {
    return actor.permissions.includes(permission);
  }

  requirePermission(actor: ActorContext, permission: Permission): void {
    if (!this.hasPermission(actor, permission)) {
      throw new MerchantForbiddenException();
    }
  }

  isMerchantScopedActor(actor: ActorContext): boolean {
    return actor.roles.some((r) =>
      MERCHANT_LEVEL_ROLES.includes(r as SystemRole),
    );
  }

  listFilter(actor: ActorContext): {
    acquirerId: string;
    merchantId?: string;
  } {
    this.requirePermission(actor, Permission.MERCHANT_READ);
    if (this.isMerchantScopedActor(actor) && actor.merchantId) {
      return { acquirerId: actor.acquirerId, merchantId: actor.merchantId };
    }
    return { acquirerId: actor.acquirerId };
  }

  assertCanAccessMerchant(
    actor: ActorContext,
    target: { acquirerId: string; id: string },
  ): void {
    if (target.acquirerId !== actor.acquirerId) {
      throw new MerchantForbiddenException();
    }
    if (this.isMerchantScopedActor(actor) && actor.merchantId) {
      if (target.id !== actor.merchantId) {
        throw new MerchantForbiddenException(
          'You can only access your own merchant record',
        );
      }
    }
  }
}
