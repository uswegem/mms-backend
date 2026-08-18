import { Module } from '@nestjs/common';
import { CbsVerificationService } from './application/services/cbs-verification.service';
import { CbsValidationProvider } from './application/ports/cbs-validation.port';
import { MockCbsValidationProvider } from './infrastructure/services/mock-cbs-validation.provider';

@Module({
  providers: [
    CbsVerificationService,
    { provide: CbsValidationProvider, useClass: MockCbsValidationProvider },
  ],
  exports: [CbsVerificationService],
})
export class CbsModule {}
