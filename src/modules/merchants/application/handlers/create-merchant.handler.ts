import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateMerchantCommand } from '../commands/create-merchant.command';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { toMerchantResponse } from '../mappers/merchant-response.mapper';

@CommandHandler(CreateMerchantCommand)
export class CreateMerchantHandler
  implements ICommandHandler<CreateMerchantCommand>
{
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: CreateMerchantCommand) {
    this.scope.requirePermission(command.actor, Permission.MERCHANT_WRITE);

    const merchant = await this.merchants.create({
      acquirerId: command.actor.acquirerId,
      legalName: command.legalName,
      tradingName: command.tradingName,
      mcc: command.mcc,
      taxId: command.taxId,
      isSchool: command.isSchool,
      city: command.city,
      postalCode: command.postalCode,
      addressLine1: command.addressLine1,
      addressLine2: command.addressLine2,
      contactPhone: command.contactPhone,
      contactEmail: command.contactEmail,
      createdBy: command.actor.sub,
    });

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'MERCHANT_CREATED',
      entityType: 'merchant',
      entityId: merchant.id,
      metadata: { tradingName: merchant.tradingName },
    });

    return toMerchantResponse(merchant);
  }
}
