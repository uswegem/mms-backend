import { MerchantStatus, MerchantStatusAction } from '@prisma/client';
import { MerchantValidationException } from '@modules/merchants/domain/exceptions/merchant.exceptions';

export interface StatusTransitionRule {
  fromStatus: MerchantStatus;
  toStatus: MerchantStatus;
  action: MerchantStatusAction;
  requiredPermission: string;
}

/** Statuses where merchant profile cannot be edited (rule 4). */
export const NON_EDITABLE_STATUSES: MerchantStatus[] = [
  MerchantStatus.PENDING_REVIEW,
  MerchantStatus.PENDING_APPROVAL,
  MerchantStatus.CLOSED,
];

/** Default transition matrix — overridden by DB seed when repository loads rules. */
export const DEFAULT_TRANSITIONS: StatusTransitionRule[] = [
  {
    fromStatus: MerchantStatus.DRAFT,
    toStatus: MerchantStatus.PENDING_REVIEW,
    action: MerchantStatusAction.SUBMIT_FOR_REVIEW,
    requiredPermission: 'merchant:status:submit',
  },
  {
    fromStatus: MerchantStatus.PENDING_REVIEW,
    toStatus: MerchantStatus.PENDING_APPROVAL,
    action: MerchantStatusAction.MOVE_TO_PENDING_APPROVAL,
    requiredPermission: 'merchant:status:approve',
  },
  {
    fromStatus: MerchantStatus.PENDING_APPROVAL,
    toStatus: MerchantStatus.ACTIVE,
    action: MerchantStatusAction.APPROVE,
    requiredPermission: 'merchant:status:checker:approve',
  },
  {
    fromStatus: MerchantStatus.PENDING_REVIEW,
    toStatus: MerchantStatus.REJECTED,
    action: MerchantStatusAction.REJECT,
    requiredPermission: 'merchant:status:reject',
  },
  {
    fromStatus: MerchantStatus.PENDING_APPROVAL,
    toStatus: MerchantStatus.REJECTED,
    action: MerchantStatusAction.REJECT,
    requiredPermission: 'merchant:status:reject',
  },
  {
    fromStatus: MerchantStatus.REJECTED,
    toStatus: MerchantStatus.PENDING_REVIEW,
    action: MerchantStatusAction.SUBMIT_FOR_REVIEW,
    requiredPermission: 'merchant:status:submit',
  },
  {
    fromStatus: MerchantStatus.ACTIVE,
    toStatus: MerchantStatus.SUSPENDED,
    action: MerchantStatusAction.SUSPEND,
    requiredPermission: 'merchant:suspend',
  },
  {
    fromStatus: MerchantStatus.ACTIVE,
    toStatus: MerchantStatus.DORMANT,
    action: MerchantStatusAction.MARK_DORMANT,
    requiredPermission: 'merchant:suspend',
  },
  {
    fromStatus: MerchantStatus.SUSPENDED,
    toStatus: MerchantStatus.ACTIVE,
    action: MerchantStatusAction.REACTIVATE,
    requiredPermission: 'merchant:suspend',
  },
  {
    fromStatus: MerchantStatus.DORMANT,
    toStatus: MerchantStatus.ACTIVE,
    action: MerchantStatusAction.REACTIVATE,
    requiredPermission: 'merchant:suspend',
  },
  {
    fromStatus: MerchantStatus.ACTIVE,
    toStatus: MerchantStatus.CLOSED,
    action: MerchantStatusAction.CLOSE,
    requiredPermission: 'merchant:close',
  },
  {
    fromStatus: MerchantStatus.SUSPENDED,
    toStatus: MerchantStatus.CLOSED,
    action: MerchantStatusAction.CLOSE,
    requiredPermission: 'merchant:close',
  },
  {
    fromStatus: MerchantStatus.DORMANT,
    toStatus: MerchantStatus.CLOSED,
    action: MerchantStatusAction.CLOSE,
    requiredPermission: 'merchant:close',
  },
];

export class StatusTransitionEngine {
  constructor(private readonly rules: StatusTransitionRule[] = DEFAULT_TRANSITIONS) {}

  assertCanEdit(current: MerchantStatus): void {
    if (NON_EDITABLE_STATUSES.includes(current)) {
      throw new MerchantValidationException(
        `Merchants in ${current} status cannot be edited`,
      );
    }
    if (current === MerchantStatus.CLOSED) {
      throw new MerchantValidationException('Closed merchants cannot be updated');
    }
  }

  findRule(
    fromStatus: MerchantStatus,
    action: MerchantStatusAction,
  ): StatusTransitionRule {
    const rule = this.rules.find(
      (r) => r.fromStatus === fromStatus && r.action === action,
    );
    if (!rule) {
      throw new MerchantValidationException(
        `Action ${action} is not allowed from status ${fromStatus}`,
      );
    }
    return rule;
  }

  getAllowedActions(
    current: MerchantStatus,
    permissions: string[],
    merchantCreatedBy: string | null,
    actorId: string,
  ): MerchantStatusAction[] {
    return this.rules
      .filter((r) => r.fromStatus === current)
      .filter((r) => permissions.includes(r.requiredPermission))
      .filter((r) => {
        if (r.action === MerchantStatusAction.APPROVE && merchantCreatedBy === actorId) {
          return false;
        }
        if (
          r.action === MerchantStatusAction.REACTIVATE &&
          current === MerchantStatus.CLOSED
        ) {
          return false;
        }
        return true;
      })
      .map((r) => r.action);
  }

  assertTransitionAllowed(
    fromStatus: MerchantStatus,
    toStatus: MerchantStatus,
    action: MerchantStatusAction,
    permissions: string[],
    merchantCreatedBy: string | null,
    actorId: string,
  ): StatusTransitionRule {
    const rule = this.findRule(fromStatus, action);
    if (rule.toStatus !== toStatus) {
      throw new MerchantValidationException(
        `Action ${action} transitions to ${rule.toStatus}, not ${toStatus}`,
      );
    }
    if (!permissions.includes(rule.requiredPermission)) {
      throw new MerchantValidationException(
        `Missing permission ${rule.requiredPermission} for action ${action}`,
      );
    }
    if (
      action === MerchantStatusAction.APPROVE &&
      merchantCreatedBy &&
      merchantCreatedBy === actorId
    ) {
      throw new MerchantValidationException(
        'Maker cannot approve their own merchant (maker-checker rule)',
      );
    }
    if (fromStatus === MerchantStatus.CLOSED) {
      throw new MerchantValidationException('Closed merchants cannot change status');
    }
    return rule;
  }
}
