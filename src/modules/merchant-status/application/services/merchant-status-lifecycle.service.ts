import { Injectable, OnModuleInit } from '@nestjs/common';
import { MerchantStatus, MerchantStatusAction } from '@prisma/client';
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

export interface StatusChangeInput {
  merchantId: string;
  action: MerchantStatusAction;
  actor: ActorContext;
  reason?: string;
  notes?: string;
}

@Injectable()
export class MerchantStatusLifecycleService implements OnModuleInit {
  private engine = new StatusTransitionEngine(DEFAULT_TRANSITIONS);

  constructor(
    private readonly repo: MerchantStatusRepository,
    private readonly audit: AuditLogService,
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

  async suspend(merchantId: string, actor: ActorContext, notes?: string) {
    return this.changeStatus({
      merchantId,
      action: MerchantStatusAction.SUSPEND,
      actor,
      notes,
    });
  }

  async reactivate(merchantId: string, actor: ActorContext, notes?: string) {
    return this.changeStatus({
      merchantId,
      action: MerchantStatusAction.REACTIVATE,
      actor,
      notes,
    });
  }

  async markDormant(merchantId: string, actor: ActorContext, notes?: string) {
    return this.changeStatus({
      merchantId,
      action: MerchantStatusAction.MARK_DORMANT,
      actor,
      notes,
    });
  }

  async close(merchantId: string, actor: ActorContext, notes?: string) {
    return this.changeStatus({
      merchantId,
      action: MerchantStatusAction.CLOSE,
      actor,
      notes,
    });
  }
}
