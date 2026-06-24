import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SuspendMerchantCommand } from '../commands/suspend-merchant.command';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { MerchantNotFoundException } from '../../domain/exceptions/merchant.exceptions';
import { MerchantStatusLifecycleService } from '@modules/merchant-status/application/services/merchant-status-lifecycle.service';

@CommandHandler(SuspendMerchantCommand)
export class SuspendMerchantHandler
  implements ICommandHandler<SuspendMerchantCommand>
{
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
    private readonly lifecycle: MerchantStatusLifecycleService,
  ) {}

  async execute(command: SuspendMerchantCommand) {
    this.scope.requirePermission(command.actor, Permission.MERCHANT_SUSPEND);

    const existing = await this.merchants.findById(command.merchantId);
    if (!existing) throw new MerchantNotFoundException(command.merchantId);
    this.scope.assertCanAccessMerchant(command.actor, existing);

    return this.lifecycle.suspend(command.merchantId, command.actor);
  }
}
