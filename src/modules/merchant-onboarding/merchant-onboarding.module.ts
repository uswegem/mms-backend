import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MakerCheckerModule } from '@modules/maker-checker/maker-checker.module';
import { CbsModule } from '@modules/cbs/cbs.module';
import { AliasModule } from '@modules/alias/alias.module';
import { QrModule } from '@modules/qr/qr.module';
import { ONBOARDING_APPROVAL_PORT } from '@modules/maker-checker/application/ports/onboarding-approval.port';
import { OnboardingController } from './presentation/http/onboarding.controller';
import { MerchantOnboardingAliasController } from './presentation/http/merchant-onboarding-alias.controller';
import { OnboardingRepository } from './infrastructure/persistence/onboarding.repository';
import { OnboardingWorkflowService } from './application/services/onboarding-workflow.service';
import { OnboardingPipelineService } from './application/services/onboarding-pipeline.service';
import { OnboardingAuditService } from './application/services/onboarding-audit.service';
import { OnboardingDuplicateService } from './application/services/onboarding-duplicate.service';
import { MerchantIssuanceService } from './application/services/merchant-issuance.service';
import { TpsIntegrationAdapter } from './infrastructure/integrations/tps-integration.adapter';
import { ONBOARDING_HANDLERS } from './application/handlers/onboarding.handlers';
import { ONBOARDING_PIPELINE_HANDLERS } from './application/handlers/onboarding-pipeline.handlers';

@Module({
  imports: [
    CqrsModule,
    AuthModule,
    AuditModule,
    forwardRef(() => MakerCheckerModule),
    CbsModule,
    AliasModule,
    QrModule,
  ],
  controllers: [OnboardingController, MerchantOnboardingAliasController],
  providers: [
    OnboardingRepository,
    OnboardingWorkflowService,
    OnboardingPipelineService,
    OnboardingAuditService,
    OnboardingDuplicateService,
    MerchantIssuanceService,
    TpsIntegrationAdapter,
    ...ONBOARDING_HANDLERS,
    ...ONBOARDING_PIPELINE_HANDLERS,
    {
      provide: ONBOARDING_APPROVAL_PORT,
      useExisting: OnboardingWorkflowService,
    },
  ],
  exports: [
    OnboardingRepository,
    OnboardingWorkflowService,
    OnboardingPipelineService,
    ONBOARDING_APPROVAL_PORT,
  ],
})
export class MerchantOnboardingModule {}
