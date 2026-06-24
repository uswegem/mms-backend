import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MakerCheckerModule } from '@modules/maker-checker/maker-checker.module';
import { CbsModule } from '@modules/cbs/cbs.module';
import { ONBOARDING_APPROVAL_PORT } from '@modules/maker-checker/application/ports/onboarding-approval.port';
import { OnboardingController } from './presentation/http/onboarding.controller';
import { OnboardingRepository } from './infrastructure/persistence/onboarding.repository';
import { OnboardingWorkflowService } from './application/services/onboarding-workflow.service';
import { ONBOARDING_HANDLERS } from './application/handlers/onboarding.handlers';

@Module({
  imports: [
    CqrsModule,
    AuthModule,
    AuditModule,
    forwardRef(() => MakerCheckerModule),
    CbsModule,
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingRepository,
    OnboardingWorkflowService,
    ...ONBOARDING_HANDLERS,
    {
      provide: ONBOARDING_APPROVAL_PORT,
      useExisting: OnboardingWorkflowService,
    },
  ],
  exports: [
    OnboardingRepository,
    OnboardingWorkflowService,
    ONBOARDING_APPROVAL_PORT,
  ],
})
export class MerchantOnboardingModule {}
