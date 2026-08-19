import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import { MakerCheckerModule } from '@modules/maker-checker/maker-checker.module';
import { KYC_UPGRADE_APPROVAL_PORT } from '@modules/maker-checker/application/ports/kyc-upgrade-approval.port';
import { TraVerificationProvider } from '@modules/merchant-onboarding/application/ports/tra-verification.port';
import { MockTraVerificationProvider } from '@modules/merchant-onboarding/infrastructure/services/mock-tra-verification.provider';
import { TransactionLimitsModule } from '@modules/transaction-limits/transaction-limits.module';
import { KycUpgradeController } from './presentation/http/kyc-upgrade.controller';
import { KycUpgradeRepository } from './infrastructure/persistence/kyc-upgrade.repository';
import { KycUpgradeService } from './application/services/kyc-upgrade.service';

/** Bounded context: KYC tier upgrade (handoff §kycup). */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    TransactionLimitsModule,
    forwardRef(() => MakerCheckerModule),
  ],
  controllers: [KycUpgradeController],
  providers: [
    KycUpgradeRepository,
    KycUpgradeService,
    MerchantScopeService,
    { provide: TraVerificationProvider, useClass: MockTraVerificationProvider },
    { provide: KYC_UPGRADE_APPROVAL_PORT, useExisting: KycUpgradeService },
  ],
  exports: [KycUpgradeRepository, KycUpgradeService, KYC_UPGRADE_APPROVAL_PORT],
})
export class KycUpgradeModule {}
