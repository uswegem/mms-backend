import { Module } from '@nestjs/common';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import { PaymentLinksRepository } from './infrastructure/persistence/payment-links.repository';
import { PaymentLinksService } from './application/services/payment-links.service';
import { PaymentLinksController } from './presentation/http/payment-links.controller';

/** Bounded context: Payment links & storefront (handoff §links). */
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [PaymentLinksController],
  providers: [
    PaymentLinksRepository,
    PaymentLinksService,
    MerchantScopeService,
  ],
  exports: [PaymentLinksRepository, PaymentLinksService],
})
export class PaymentLinksModule {}
