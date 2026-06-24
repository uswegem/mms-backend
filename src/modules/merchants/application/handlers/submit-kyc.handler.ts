import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SubmitKycCommand } from '../commands/submit-kyc.command';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import {
  MerchantNotFoundException,
  MerchantValidationException,
} from '../../domain/exceptions/merchant.exceptions';
import { toMerchantResponse } from '../mappers/merchant-response.mapper';

@CommandHandler(SubmitKycCommand)
export class SubmitKycHandler implements ICommandHandler<SubmitKycCommand> {
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: SubmitKycCommand) {
    this.scope.requirePermission(command.actor, Permission.MERCHANT_KYC_WRITE);

    const existing = await this.merchants.findById(command.merchantId);
    if (!existing) throw new MerchantNotFoundException(command.merchantId);
    this.scope.assertCanAccessMerchant(command.actor, existing);

    try {
      const merchant = await this.merchants.submitKyc(command.merchantId);

      await this.audit.record({
        actorId: command.actor.sub,
        action: 'MERCHANT_KYC_SUBMITTED',
        entityType: 'merchant',
        entityId: merchant.id,
        metadata: {},
      });

      return toMerchantResponse(merchant);
    } catch (err) {
      if (err instanceof Error && err.message === 'KYC_DOCUMENTS_REQUIRED') {
        throw new MerchantValidationException(
          'At least one KYC document (ID, license, or TIN) is required before submission',
        );
      }
      throw err;
    }
  }
}
