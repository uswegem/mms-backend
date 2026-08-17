import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  MERCHANT_LEVEL_ROLES,
  SystemRole,
} from '@infrastructure/auth/rbac/enums/system-role.enum';
import { ActorContext } from '../interfaces/actor-context.interface';

/**
 * Mirrors UserScopeService's isMerchantScopedActor/listFilter pattern
 * (modules/users) for domains where a merchant-level actor must be
 * confined to their own merchant's records — transactions and
 * settlements specifically, where the query/get-by-id endpoints would
 * otherwise let one merchant read another's ledger by supplying any
 * merchantId or record ID.
 */
@Injectable()
export class MerchantScopeService {
  isMerchantScopedActor(actor: ActorContext): boolean {
    return actor.roles.some((r) =>
      MERCHANT_LEVEL_ROLES.includes(r as SystemRole),
    );
  }

  /**
   * Returns the merchantId a merchant-scoped actor is confined to
   * (overriding whatever was requested), or the actor's original request
   * unchanged for an acquirer/back-office-level actor.
   *
   * Fails closed: a merchant-scoped role whose token has no merchantId is
   * a malformed/inconsistent state, not "no filter" — silently dropping
   * the filter here would leak every merchant's data to that actor.
   */
  scopeMerchantId(actor: ActorContext, requested?: string): string | undefined {
    if (this.isMerchantScopedActor(actor)) {
      if (!actor.merchantId) {
        throw new ForbiddenException(
          'Merchant-scoped role has no merchant on record',
        );
      }
      return actor.merchantId;
    }
    return requested;
  }

  /** Throws if a merchant-scoped actor is looking at a record outside their own merchant. */
  assertCanAccessMerchant(actor: ActorContext, recordMerchantId: string): void {
    if (
      this.isMerchantScopedActor(actor) &&
      recordMerchantId !== actor.merchantId
    ) {
      throw new ForbiddenException(
        "You do not have access to this merchant's records",
      );
    }
  }
}
