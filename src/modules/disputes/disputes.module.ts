import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import { MakerCheckerModule } from '@modules/maker-checker/maker-checker.module';
import { DISPUTE_REFUND_APPROVAL_PORT } from '@modules/maker-checker/application/ports/dispute-refund-approval.port';
import { DisputesController } from './presentation/http/disputes.controller';
import { DisputesRepository } from './infrastructure/persistence/disputes.repository';
import { DisputesService } from './application/services/disputes.service';

/** Bounded context: Disputes & refunds (handoff §disputes/§disputedet). */
@Module({
  imports: [DatabaseModule, AuditModule, forwardRef(() => MakerCheckerModule)],
  controllers: [DisputesController],
  providers: [
    DisputesRepository,
    DisputesService,
    MerchantScopeService,
    {
      provide: DISPUTE_REFUND_APPROVAL_PORT,
      useExisting: DisputesService,
    },
  ],
  exports: [DisputesRepository, DisputesService, DISPUTE_REFUND_APPROVAL_PORT],
})
export class DisputesModule {}
