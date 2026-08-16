import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CbsPostingProvider,
  CbsPostingResult,
} from '../../application/ports/cbs-posting.port';

/** Dev/UAT stand-in — always succeeds. Replace once real CBS posting is available. */
@Injectable()
export class MockCbsPostingProvider extends CbsPostingProvider {
  private readonly logger = new Logger(MockCbsPostingProvider.name);

  postSettlement(input: {
    merchantId: string;
    accountNumber: string;
    netAmount: string;
    cycleDate: Date;
  }): Promise<CbsPostingResult> {
    const postingRef = `CBS-MOCK-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.logger.log(
      `Mock-posted ${input.netAmount} TZS to ${input.accountNumber} for merchant ${input.merchantId} (${postingRef})`,
    );
    return Promise.resolve({ postingRef, postedAt: new Date() });
  }
}
