import { Inject, Optional } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { ApprovalEntityType } from '@prisma/client';
import { RejectTaskCommand } from '../commands/reject-task.command';
import { MakerCheckerService } from '../services/maker-checker.service';
import { toApprovalTaskResponse } from '../mappers/approval-response.mapper';
import { ApprovalForbiddenException } from '../../domain/exceptions/approval.exceptions';
import { ONBOARDING_APPROVAL_PORT } from '../ports/onboarding-approval.port';
import type { OnboardingApprovalPort } from '../ports/onboarding-approval.port';
import { MERCHANT_STATUS_APPROVAL_PORT } from '../ports/merchant-status-approval.port';
import type { MerchantStatusApprovalPort } from '../ports/merchant-status-approval.port';
import { DISPUTE_REFUND_APPROVAL_PORT } from '../ports/dispute-refund-approval.port';
import type { DisputeRefundApprovalPort } from '../ports/dispute-refund-approval.port';
import { KYC_UPGRADE_APPROVAL_PORT } from '../ports/kyc-upgrade-approval.port';
import type { KycUpgradeApprovalPort } from '../ports/kyc-upgrade-approval.port';

@CommandHandler(RejectTaskCommand)
export class RejectTaskHandler implements ICommandHandler<RejectTaskCommand> {
  constructor(
    private readonly makerChecker: MakerCheckerService,
    private readonly audit: AuditLogService,
    @Optional()
    @Inject(ONBOARDING_APPROVAL_PORT)
    private readonly onboardingApproval?: OnboardingApprovalPort,
    @Optional()
    @Inject(MERCHANT_STATUS_APPROVAL_PORT)
    private readonly merchantStatusApproval?: MerchantStatusApprovalPort,
    @Optional()
    @Inject(DISPUTE_REFUND_APPROVAL_PORT)
    private readonly disputeRefundApproval?: DisputeRefundApprovalPort,
    @Optional()
    @Inject(KYC_UPGRADE_APPROVAL_PORT)
    private readonly kycUpgradeApproval?: KycUpgradeApprovalPort,
  ) {}

  async execute(command: RejectTaskCommand) {
    const existing = await this.makerChecker.getTask(command.taskId);
    if (existing.acquirerId !== command.actor.acquirerId) {
      throw new ApprovalForbiddenException();
    }

    const task = await this.makerChecker.rejectTask(
      command.taskId,
      command.actor.sub,
      command.notes,
    );

    // See approve-task.handler.ts: recorded immediately after the task's
    // own rejection is durably committed, and before either downstream
    // port — which can itself fail — so that failure can never leave a
    // task that is genuinely REJECTED in the database with no audit trail
    // of the rejection.
    await this.audit.record({
      actorId: command.actor.sub,
      action: 'APPROVAL_TASK_REJECTED',
      entityType: 'approval_task',
      entityId: task.id,
      metadata: { entityType: task.entityType, entityId: task.entityId },
    });

    if (
      this.onboardingApproval &&
      (task.entityType === ApprovalEntityType.MERCHANT_ONBOARDING ||
        task.entityType === ApprovalEntityType.SCHOOL_ONBOARDING)
    ) {
      await this.onboardingApproval.onCheckerRejected(
        task.entityId,
        command.actor.sub,
        command.notes,
      );
    }

    if (
      this.merchantStatusApproval &&
      task.entityType === ApprovalEntityType.MERCHANT_STATUS_CHANGE
    ) {
      await this.merchantStatusApproval.onCheckerRejected(
        task.entityId,
        command.actor.sub,
        command.notes,
      );
    }

    if (
      this.disputeRefundApproval &&
      task.entityType === ApprovalEntityType.DISPUTE_REFUND
    ) {
      await this.disputeRefundApproval.onCheckerRejected(
        task.entityId,
        command.actor.sub,
        command.notes,
      );
    }

    if (
      this.kycUpgradeApproval &&
      task.entityType === ApprovalEntityType.KYC_TIER_UPGRADE
    ) {
      await this.kycUpgradeApproval.onCheckerRejected(
        task.entityId,
        command.actor.sub,
        command.notes,
      );
    }

    return toApprovalTaskResponse(task);
  }
}
