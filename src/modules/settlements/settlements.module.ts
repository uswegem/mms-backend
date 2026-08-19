import { Module } from '@nestjs/common';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import { FeeSchedulesModule } from '@modules/fee-schedules/fee-schedules.module';
import { SettlementsRepository } from './infrastructure/persistence/settlements.repository';
import { CbsPostingProvider } from './application/ports/cbs-posting.port';
import { MockCbsPostingProvider } from './infrastructure/services/mock-cbs-posting.provider';
import { SettlementsService } from './application/services/settlements.service';
import { SettlementSweepJob } from './infrastructure/jobs/settlement-sweep.job';
import { SettlementsController } from './presentation/http/settlements.controller';

/** Bounded context: Settlement */
@Module({
  imports: [DatabaseModule, AuditModule, FeeSchedulesModule],
  controllers: [SettlementsController],
  providers: [
    SettlementsRepository,
    { provide: CbsPostingProvider, useClass: MockCbsPostingProvider },
    SettlementsService,
    SettlementSweepJob,
    MerchantScopeService,
  ],
  exports: [SettlementsRepository],
})
export class SettlementsModule {}
