import { MerchantStatus } from '@prisma/client';
import { NON_EDITABLE_STATUSES } from '@modules/merchant-status/domain/services/status-transition.engine';
import { MerchantValidationException } from '../exceptions/merchant.exceptions';

/** @deprecated Use MerchantStatusLifecycleService — kept for backward-compatible imports */
export class MerchantStatusService {
  static assertCanSuspend(current: MerchantStatus): void {
    if (current !== MerchantStatus.ACTIVE) {
      throw new MerchantValidationException(
        `Cannot suspend merchant in ${current} status`,
      );
    }
  }

  static assertCanActivate(current: MerchantStatus): void {
    const activatable: MerchantStatus[] = [
      MerchantStatus.SUSPENDED,
      MerchantStatus.DORMANT,
    ];
    if (!activatable.includes(current)) {
      throw new MerchantValidationException(
        `Cannot reactivate merchant in ${current} status`,
      );
    }
  }

  static assertCanMarkDormant(current: MerchantStatus): void {
    if (current !== MerchantStatus.ACTIVE) {
      throw new MerchantValidationException(
        `Cannot mark merchant dormant from ${current} status`,
      );
    }
  }

  static assertCanUpdate(current: MerchantStatus): void {
    if (NON_EDITABLE_STATUSES.includes(current)) {
      throw new MerchantValidationException(
        `Merchants in ${current} status cannot be edited`,
      );
    }
  }
}
