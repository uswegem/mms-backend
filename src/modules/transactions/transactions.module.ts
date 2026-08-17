import { Module } from '@nestjs/common';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { AliasModule } from '@modules/alias/alias.module';
import { RealtimeModule } from '@modules/realtime/realtime.module';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import { TransactionsRepository } from './infrastructure/persistence/transactions.repository';
import { TipsPaymentProvider } from './application/ports/tips-payment.port';
import { MockTipsPaymentProvider } from './infrastructure/services/mock-tips-payment.provider';
import { TransactionsService } from './application/services/transactions.service';
import { PaymentTimeoutReconciliationJob } from './infrastructure/jobs/payment-timeout-reconciliation.job';
import { TransactionsController } from './presentation/http/transactions.controller';

/** Bounded context: Transactions / Payments */
@Module({
  imports: [DatabaseModule, AuditModule, AliasModule, RealtimeModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsRepository,
    { provide: TipsPaymentProvider, useClass: MockTipsPaymentProvider },
    TransactionsService,
    PaymentTimeoutReconciliationJob,
    MerchantScopeService,
  ],
  exports: [TransactionsRepository, TipsPaymentProvider],
})
export class TransactionsModule {}
