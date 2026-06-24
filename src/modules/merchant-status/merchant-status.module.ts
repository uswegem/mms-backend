import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantsModule } from '@modules/merchants/merchants.module';
import { MerchantStatusController } from './presentation/http/merchant-status.controller';
import { MerchantStatusRepository } from './infrastructure/persistence/merchant-status.repository';
import { MerchantStatusLifecycleService } from './application/services/merchant-status-lifecycle.service';

@Module({
  imports: [AuthModule, AuditModule, forwardRef(() => MerchantsModule)],
  controllers: [MerchantStatusController],
  providers: [MerchantStatusRepository, MerchantStatusLifecycleService],
  exports: [MerchantStatusLifecycleService, MerchantStatusRepository],
})
export class MerchantStatusModule {}
