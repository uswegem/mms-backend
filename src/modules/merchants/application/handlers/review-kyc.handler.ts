import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ReviewKycCommand } from '../commands/review-kyc.command';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { MerchantNotFoundException } from '../../domain/exceptions/merchant.exceptions';
import { toMerchantResponse } from '../mappers/merchant-response.mapper';

@CommandHandler(ReviewKycCommand)
export class ReviewKycHandler implements ICommandHandler<ReviewKycCommand> {
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: ReviewKycCommand) {
    this.scope.requirePermission(command.actor, Permission.MERCHANT_KYC_REVIEW);

    const existing = await this.merchants.findById(command.merchantId);
    if (!existing) throw new MerchantNotFoundException(command.merchantId);
    this.scope.assertCanAccessMerchant(command.actor, existing);

    const merchant = await this.merchants.reviewKyc(
      command.merchantId,
      command.actor.sub,
      command.decision,
      command.notes,
    );

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'MERCHANT_KYC_REVIEWED',
      entityType: 'merchant',
      entityId: merchant.id,
      metadata: { decision: command.decision },
    });

    return toMerchantResponse(merchant);
  }
}
