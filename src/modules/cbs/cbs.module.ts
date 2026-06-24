import { Module } from '@nestjs/common';
import { CbsVerificationService } from './application/services/cbs-verification.service';

@Module({
  providers: [CbsVerificationService],
  exports: [CbsVerificationService],
})
export class CbsModule {}
