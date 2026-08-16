import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettlementsService } from '../../application/services/settlements.service';

/** T+1 nightly sweep at 02:00 — matches the design prototype's stated cycle timing. */
@Injectable()
export class SettlementSweepJob {
  constructor(private readonly settlements: SettlementsService) {}

  @Cron('0 2 * * *')
  async run(): Promise<void> {
    await this.settlements.sweepAndPost();
  }
}
