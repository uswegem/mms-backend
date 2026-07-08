import { Inject, Optional } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { ApprovalEntityType } from '@prisma/client';
import { ApproveTaskCommand } from '../commands/approve-task.command';
import { MakerCheckerService } from '../services/maker-checker.service';
import { toApprovalTaskResponse } from '../mappers/approval-response.mapper';
import { ApprovalForbiddenException } from '../../domain/exceptions/approval.exceptions';
import { ONBOARDING_APPROVAL_PORT } from '../ports/onboarding-approval.port';
import type { OnboardingApprovalPort } from '../ports/onboarding-approval.port';
import { MERCHANT_STATUS_APPROVAL_PORT } from '../ports/merchant-status-approval.port';
import type { MerchantStatusApprovalPort } from '../ports/merchant-status-approval.port';

@CommandHandler(ApproveTaskCommand)
export class ApproveTaskHandler implements ICommandHandler<ApproveTaskCommand> {
  constructor(
    private readonly makerChecker: MakerCheckerService,
    private readonly audit: AuditLogService,
    @Optional()
    @Inject(ONBOARDING_APPROVAL_PORT)
    private readonly onboardingApproval?: OnboardingApprovalPort,
    @Optional()
    @Inject(MERCHANT_STATUS_APPROVAL_PORT)
    private readonly merchantStatusApproval?: MerchantStatusApprovalPort,
  ) {}

  async execute(command: ApproveTaskCommand) {
    const existing = await this.makerChecker.getTask(command.taskId);
    if (existing.acquirerId !== command.actor.acquirerId) {
      throw new ApprovalForbiddenException();
    }

    const task = await this.makerChecker.approveTask(
      command.taskId,
      command.actor.sub,
      command.notes,
    );

    if (
      this.onboardingApproval &&
      (task.entityType === ApprovalEntityType.MERCHANT_ONBOARDING ||
        task.entityType === ApprovalEntityType.SCHOOL_ONBOARDING)
    ) {
      await this.onboardingApproval.onCheckerApproved(
        task.entityId,
        command.actor.sub,
      );
    }

    if (
      this.merchantStatusApproval &&
      task.entityType === ApprovalEntityType.MERCHANT_STATUS_CHANGE
    ) {
      await this.merchantStatusApproval.onCheckerApproved(
        task.entityId,
        command.actor.sub,
      );
    }

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'APPROVAL_TASK_APPROVED',
      entityType: 'approval_task',
      entityId: task.id,
      metadata: { entityType: task.entityType, entityId: task.entityId },
    });

    return toApprovalTaskResponse(task);
  }
}
