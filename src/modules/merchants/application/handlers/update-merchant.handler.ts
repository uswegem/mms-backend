import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateMerchantCommand } from '../commands/update-merchant.command';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { MerchantStatusService } from '../../domain/services/merchant-status.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { ReferenceDataService } from '@modules/reference-data/application/services/reference-data.service';
import { MerchantNotFoundException } from '../../domain/exceptions/merchant.exceptions';
import { toMerchantResponse } from '../mappers/merchant-response.mapper';

@CommandHandler(UpdateMerchantCommand)
export class UpdateMerchantHandler
  implements ICommandHandler<UpdateMerchantCommand>
{
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
    private readonly audit: AuditLogService,
    private readonly referenceData: ReferenceDataService,
  ) {}

  async execute(command: UpdateMerchantCommand) {
    this.scope.requirePermission(command.actor, Permission.MERCHANT_WRITE);

    const existing = await this.merchants.findById(command.merchantId);
    if (!existing) throw new MerchantNotFoundException(command.merchantId);
    this.scope.assertCanAccessMerchant(command.actor, existing);
    MerchantStatusService.assertCanUpdate(existing.status);

    // This is a partial (PATCH-style) update — a client updating only
    // `ward`, say, won't resend `region`/`district`. Validate the *effective*
    // combination (submitted fields merged over the merchant's current
    // profile), not just whatever happens to be present on this one
    // command, or a legitimate single-field update would fail the
    // "ward without a district" check purely from having a `command.region`
    // that's undefined.
    await this.referenceData.validateLocation({
      region: command.region ?? existing.profile?.region ?? undefined,
      district: command.district ?? existing.profile?.district ?? undefined,
      ward: command.ward ?? existing.profile?.ward ?? undefined,
      postalCode: command.postalCode ?? existing.profile?.postalCode ?? undefined,
    });

    const merchant = await this.merchants.update(command.merchantId, {
      tradingName: command.tradingName,
      mcc: command.mcc,
      taxId: command.taxId,
      region: command.region,
      district: command.district,
      ward: command.ward,
      city: command.city,
      postalCode: command.postalCode,
      addressLine1: command.addressLine1,
      addressLine2: command.addressLine2,
      contactPhone: command.contactPhone,
      contactEmail: command.contactEmail,
      updatedBy: command.actor.sub,
    });

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'MERCHANT_UPDATED',
      entityType: 'merchant',
      entityId: merchant.id,
      metadata: {},
    });

    return toMerchantResponse(merchant);
  }
}
