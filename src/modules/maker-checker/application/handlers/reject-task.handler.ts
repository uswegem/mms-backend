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

@CommandHandler(RejectTaskCommand)
export class RejectTaskHandler implements ICommandHandler<RejectTaskCommand> {
  constructor(
    private readonly makerChecker: MakerCheckerService,
    private readonly audit: AuditLogService,
    @Optional()
    @Inject(ONBOARDING_APPROVAL_PORT)
    private readonly onboardingApproval?: OnboardingApprovalPort,
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

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'APPROVAL_TASK_REJECTED',
      entityType: 'approval_task',
      entityId: task.id,
      metadata: { entityType: task.entityType, entityId: task.entityId },
    });

    return toApprovalTaskResponse(task);
  }
}
