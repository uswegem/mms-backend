import { Module } from '@nestjs/common';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { ReconciliationRepository } from './infrastructure/persistence/reconciliation.repository';
import { TipsSettlementReportProvider } from './application/ports/tips-settlement-report.port';
import { MockTipsSettlementReportProvider } from './infrastructure/services/mock-tips-settlement-report.provider';
import { ReconciliationService } from './application/services/reconciliation.service';
import { ReconciliationMatchJob } from './infrastructure/jobs/reconciliation-match.job';
import { ReconciliationController } from './presentation/http/reconciliation.controller';

/** Bounded context: Reconciliation */
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationRepository,
    {
      provide: TipsSettlementReportProvider,
      useClass: MockTipsSettlementReportProvider,
    },
    ReconciliationService,
    ReconciliationMatchJob,
  ],
})
export class ReconciliationModule {}
