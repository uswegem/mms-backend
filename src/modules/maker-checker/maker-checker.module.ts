import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantOnboardingModule } from '@modules/merchant-onboarding/merchant-onboarding.module';
import { MerchantStatusModule } from '@modules/merchant-status/merchant-status.module';
import { ApprovalsController } from './presentation/http/approvals.controller';
import { ApprovalsRepository } from './infrastructure/persistence/approvals.repository';
import { MakerCheckerService } from './application/services/maker-checker.service';
import { ListApprovalTasksHandler } from './application/handlers/list-approval-tasks.handler';
import { GetApprovalTaskHandler } from './application/handlers/get-approval-task.handler';
import { ApproveTaskHandler } from './application/handlers/approve-task.handler';
import { RejectTaskHandler } from './application/handlers/reject-task.handler';

const handlers = [
  ListApprovalTasksHandler,
  GetApprovalTaskHandler,
  ApproveTaskHandler,
  RejectTaskHandler,
];

@Module({
  imports: [
    CqrsModule,
    AuthModule,
    AuditModule,
    forwardRef(() => MerchantOnboardingModule),
    forwardRef(() => MerchantStatusModule),
  ],
  controllers: [ApprovalsController],
  providers: [ApprovalsRepository, MakerCheckerService, ...handlers],
  exports: [MakerCheckerService, ApprovalsRepository],
})
export class MakerCheckerModule {}
