import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MakerCheckerModule } from '@modules/maker-checker/maker-checker.module';
import { CbsModule } from '@modules/cbs/cbs.module';
import { AliasModule } from '@modules/alias/alias.module';
import { QrModule } from '@modules/qr/qr.module';
import { ReferenceDataModule } from '@modules/reference-data/reference-data.module';
import { ONBOARDING_APPROVAL_PORT } from '@modules/maker-checker/application/ports/onboarding-approval.port';
import { OnboardingController } from './presentation/http/onboarding.controller';
import { MerchantOnboardingAliasController } from './presentation/http/merchant-onboarding-alias.controller';
import { OnboardingRepository } from './infrastructure/persistence/onboarding.repository';
import { OnboardingWorkflowService } from './application/services/onboarding-workflow.service';
import { OnboardingPipelineService } from './application/services/onboarding-pipeline.service';
import { OnboardingAuditService } from './application/services/onboarding-audit.service';
import { OnboardingDuplicateService } from './application/services/onboarding-duplicate.service';
import { MerchantIssuanceService } from './application/services/merchant-issuance.service';
import { IdentityVerificationService } from './application/services/identity-verification.service';
import { TpsIntegrationAdapter } from './infrastructure/integrations/tps-integration.adapter';
import { NidaVerificationProvider } from './application/ports/nida-verification.port';
import { TraVerificationProvider } from './application/ports/tra-verification.port';
import { MockNidaVerificationProvider } from './infrastructure/services/mock-nida-verification.provider';
import { MockTraVerificationProvider } from './infrastructure/services/mock-tra-verification.provider';
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
    ReferenceDataModule,
  ],
  controllers: [OnboardingController, MerchantOnboardingAliasController],
  providers: [
    OnboardingRepository,
    OnboardingWorkflowService,
    OnboardingPipelineService,
    OnboardingAuditService,
    OnboardingDuplicateService,
    MerchantIssuanceService,
    IdentityVerificationService,
    TpsIntegrationAdapter,
    {
      provide: NidaVerificationProvider,
      useClass: MockNidaVerificationProvider,
    },
    { provide: TraVerificationProvider, useClass: MockTraVerificationProvider },
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
