import { Module } from '@nestjs/common';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { FeeScheduleController } from './presentation/http/fee-schedule.controller';
import { FeeScheduleService } from './application/services/fee-schedule.service';

/** Bounded context: Fee schedule / MDR configuration (handoff §cfgfees). */
@Module({
  imports: [DatabaseModule],
  controllers: [FeeScheduleController],
  providers: [FeeScheduleService],
  exports: [FeeScheduleService],
})
export class FeeSchedulesModule {}
