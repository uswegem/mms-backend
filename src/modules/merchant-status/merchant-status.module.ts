import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantsModule } from '@modules/merchants/merchants.module';
import { MakerCheckerModule } from '@modules/maker-checker/maker-checker.module';
import { MERCHANT_STATUS_APPROVAL_PORT } from '@modules/maker-checker/application/ports/merchant-status-approval.port';
import { MerchantStatusController } from './presentation/http/merchant-status.controller';
import { MerchantStatusRepository } from './infrastructure/persistence/merchant-status.repository';
import { MerchantStatusLifecycleService } from './application/services/merchant-status-lifecycle.service';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    forwardRef(() => MerchantsModule),
    forwardRef(() => MakerCheckerModule),
  ],
  controllers: [MerchantStatusController],
  providers: [
    MerchantStatusRepository,
    MerchantStatusLifecycleService,
    {
      provide: MERCHANT_STATUS_APPROVAL_PORT,
      useExisting: MerchantStatusLifecycleService,
    },
  ],
  exports: [
    MerchantStatusLifecycleService,
    MerchantStatusRepository,
    MERCHANT_STATUS_APPROVAL_PORT,
  ],
})
export class MerchantStatusModule {}
