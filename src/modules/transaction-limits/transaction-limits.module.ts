import { Module } from '@nestjs/common';
import { TransactionLimitPolicyController } from './presentation/http/transaction-limit-policy.controller';
import { TransactionLimitPolicyService } from './application/services/transaction-limit-policy.service';

@Module({
  controllers: [TransactionLimitPolicyController],
  providers: [TransactionLimitPolicyService],
  exports: [TransactionLimitPolicyService],
})
export class TransactionLimitsModule {}
