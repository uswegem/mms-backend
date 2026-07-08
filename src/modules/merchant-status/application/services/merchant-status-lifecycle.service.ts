import { Injectable, OnModuleInit } from '@nestjs/common';
import { ApprovalEntityType, MerchantStatus, MerchantStatusAction } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import {
  DEFAULT_TRANSITIONS,
  StatusTransitionEngine,
} from '../../domain/services/status-transition.engine';
import { MerchantStatusRepository } from '../../infrastructure/persistence/merchant-status.repository';
import {
  MerchantNotFoundException,
  MerchantValidationException,
} from '@modules/merchants/domain/exceptions/merchant.exceptions';
import { toMerchantResponse } from '@modules/merchants/application/mappers/merchant-response.mapper';
import { MakerCheckerService } from '@modules/maker-checker/application/services/maker-checker.service';
import type { MerchantStatusApprovalPort } from '@modules/maker-checker/application/ports/merchant-status-approval.port';

const REQUESTABLE_STATUS_ACTIONS: MerchantStatusAction[] = [
  MerchantStatusAction.SUSPEND,
  MerchantStatusAction.REACTIVATE,
  MerchantStatusAction.MARK_DORMANT,
  MerchantStatusAction.CLOSE,
];

export interface StatusChangeInput {
  merchantId: string;
  action: MerchantStatusAction;
  actor: ActorContext;
  reason?: string;
  notes?: string;
}

@Injectable()
export class MerchantStatusLifecycleService
  implements OnModuleInit, MerchantStatusApprovalPort
{
  private engine = new StatusTransitionEngine(DEFAULT_TRANSITIONS);

  constructor(
    private readonly repo: MerchantStatusRepository,
    private readonly audit: AuditLogService,
    private readonly makerChecker: MakerCheckerService,
  ) {}

  async onModuleInit() {
    const rules = await this.repo.loadTransitionRules();
    if (rules.length > 0) {
      this.engine = new StatusTransitionEngine(rules);
    } else {
      await this.repo.seedTransitions(DEFAULT_TRANSITIONS);
    }
  }

  getEngine(): StatusTransitionEngine {
    return this.engine;
  }

  async getAllowedActions(merchantId: string, actor: ActorContext) {
    const merchant = await this.repo.findMerchantById(merchantId);
    if (!merchant) throw new MerchantNotFoundException(merchantId);

    const actions = this.engine.getAllowedActions(
      merchant.status,
      actor.permissions,
      merchant.createdBy,
      actor.sub,
    );

    return {
      merchantId,
      currentStatus: merchant.status,
      allowedActions: actions,
    };
  }

  async getHistory(merchantId: string) {
    const merchant = await this.repo.findMerchantById(merchantId);
    if (!merchant) throw new MerchantNotFoundException(merchantId);

    const rows = await this.repo.listHistory(merchantId);
    return rows.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      action: h.action,
      actorId: h.actorId,
      reason: h.reason,
      notes: h.notes,
      createdAt: h.createdAt.toISOString(),
    }));
  }

  async changeStatus(input: StatusChangeInput) {
    const merchant = await this.repo.findMerchantById(input.merchantId);
    if (!merchant) throw new MerchantNotFoundException(input.merchantId);

    const rule = this.engine.findRule(merchant.status, input.action);
    this.engine.assertTransitionAllowed(
      merchant.status,
      rule.toStatus,
      input.action,
      input.actor.permissions,
      merchant.createdBy,
      input.actor.sub,
    );

    const isDuplicate = await this.repo.hasRecentDuplicate(
      input.merchantId,
      input.action,
    );
    if (isDuplicate) {
      throw new MerchantValidationException(
        'Duplicate status transition detected — please wait before retrying',
      );
    }

    const onboardedAt =
      input.action === MerchantStatusAction.APPROVE ? new Date() : undefined;

    let updated;
    try {
      updated = await this.repo.transitionStatus({
      merchantId: input.merchantId,
      fromStatus: merchant.status,
      toStatus: rule.toStatus,
      action: input.action,
      actorId: input.actor.sub,
      reason: input.reason,
      notes: input.notes,
      onboardedAt,
    });
    } catch (err) {
      if (err instanceof Error && err.message === 'STATUS_CONFLICT') {
        throw new MerchantValidationException(
          'Merchant status changed concurrently — refresh and retry',
        );
      }
      throw err;
    }

    await this.audit.record({
      actorId: input.actor.sub,
      action: `MERCHANT_STATUS_${input.action}`,
      entityType: 'merchant',
      entityId: input.merchantId,
      metadata: {
        fromStatus: merchant.status,
        toStatus: rule.toStatus,
        reason: input.reason,
      },
    });

    return toMerchantResponse(updated);
  }

  async submitForReview(
    merchantId: string,
    actor: ActorContext,
    notes?: string,
  ) {
    return this.changeStatus({
      merchantId,
      action: MerchantStatusAction.SUBMIT_FOR_REVIEW,
      actor,
      notes,
    });
  }

  async moveToPendingApproval(
    merchantId: string,
    actor: ActorContext,
    notes?: string,
  ) {
    return this.changeStatus({
      merchantId,
      action: MerchantStatusAction.MOVE_TO_PENDING_APPROVAL,
      actor,
      notes,
    });
  }

  async approve(merchantId: string, actor: ActorContext, notes?: string) {
    return this.changeStatus({
      merchantId,
      action: MerchantStatusAction.APPROVE,
      actor,
      notes,
    });
  }

  async reject(
    merchantId: string,
    actor: ActorContext,
    reason?: string,
    notes?: string,
  ) {
    return this.changeStatus({
      merchantId,
      action: MerchantStatusAction.REJECT,
      actor,
      reason,
      notes,
    });
  }

  /**
   * Requests a status change instead of applying it: validates the transition
   * is theoretically reachable for this actor, then creates a maker-checker
   * ApprovalTask and stashes the requested action/reason on the merchant row
   * (ApprovalTask has no payload column). The actual transition only happens
   * in applyApprovedStatusChange, once a different user approves the task.
   */
  async requestStatusChange(
    merchantId: string,
    actor: ActorContext,
    action: MerchantStatusAction,
    reason: string,
    notes?: string,
  ) {
    if (!REQUESTABLE_STATUS_ACTIONS.includes(action)) {
      throw new MerchantValidationException(
        `Action ${action} cannot be requested via maker-checker`,
      );
    }
    const merchant = await this.repo.findMerchantById(merchantId);
    if (!merchant) throw new MerchantNotFoundException(merchantId);

    if (merchant.pendingStatusAction) {
      throw new MerchantValidationException(
        'A status change request is already pending approval for this merchant',
      );
    }

    const rule = this.engine.findRule(merchant.status, action);
    this.engine.assertTransitionAllowed(
      merchant.status,
      rule.toStatus,
      action,
      actor.permissions,
      merchant.createdBy,
      actor.sub,
    );

    // Created first: if the pending-fields write below ever fails, we're left
    // with an orphaned PENDING task rather than pending-fields with no task —
    // applyApprovedStatusChange fails loudly on that shape instead of silently
    // no-op'ing, which surfaces the inconsistency to the checker.
    const task = await this.makerChecker.createTask(
      actor.acquirerId,
      ApprovalEntityType.MERCHANT_STATUS_CHANGE,
      merchantId,
      actor.sub,
    );

    const updated = await this.repo.setPendingStatusRequest(merchantId, {
      action,
      reason,
      requestedBy: actor.sub,
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'MERCHANT_STATUS_CHANGE_REQUESTED',
      entityType: 'merchant',
      entityId: merchantId,
      metadata: { requestedAction: action, reason, approvalTaskId: task.id },
    });

    return toMerchantResponse(updated);
  }

  async onCheckerApproved(merchantId: string, checkerId: string): Promise<void> {
    await this.applyApprovedStatusChange(merchantId, checkerId);
  }

  async onCheckerRejected(merchantId: string, checkerId: string, notes?: string): Promise<void> {
    await this.clearRejectedStatusRequest(merchantId, checkerId, notes);
  }

  /** Called only by the maker-checker approval dispatch once a different user approves. */
  async applyApprovedStatusChange(merchantId: string, checkerId: string) {
    const merchant = await this.repo.findMerchantById(merchantId);
    if (!merchant) throw new MerchantNotFoundException(merchantId);
    if (!merchant.pendingStatusAction) {
      throw new MerchantValidationException(
        'No pending status change request found for this merchant',
      );
    }

    const action = merchant.pendingStatusAction;
    const reason = merchant.pendingStatusReason ?? undefined;

    // Re-validate the transition is still legal — status may have drifted
    // since the request was created.
    const rule = this.engine.findRule(merchant.status, action);

    const isDuplicate = await this.repo.hasRecentDuplicate(merchantId, action);
    if (isDuplicate) {
      throw new MerchantValidationException(
        'Duplicate status transition detected — please wait before retrying',
      );
    }

    let updated;
    try {
      updated = await this.repo.transitionStatus({
        merchantId,
        fromStatus: merchant.status,
        toStatus: rule.toStatus,
        action,
        actorId: checkerId,
        reason,
        notes: `Approved status change request (maker: ${merchant.pendingStatusRequestedBy ?? 'unknown'})`,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'STATUS_CONFLICT') {
        throw new MerchantValidationException(
          'Merchant status changed concurrently — refresh and retry',
        );
      }
      throw err;
    }

    await this.audit.record({
      actorId: checkerId,
      action: `MERCHANT_STATUS_${action}`,
      entityType: 'merchant',
      entityId: merchantId,
      metadata: { fromStatus: merchant.status, toStatus: rule.toStatus, reason, viaApproval: true },
    });

    return toMerchantResponse(updated);
  }

  /** Called only by the maker-checker approval dispatch on rejection. */
  async clearRejectedStatusRequest(merchantId: string, checkerId: string, notes?: string) {
    const merchant = await this.repo.findMerchantById(merchantId);
    if (!merchant) throw new MerchantNotFoundException(merchantId);

    await this.repo.clearPendingStatusRequest(merchantId);

    await this.audit.record({
      actorId: checkerId,
      action: 'MERCHANT_STATUS_CHANGE_REJECTED',
      entityType: 'merchant',
      entityId: merchantId,
      metadata: { requestedAction: merchant.pendingStatusAction, notes },
    });
  }
}
