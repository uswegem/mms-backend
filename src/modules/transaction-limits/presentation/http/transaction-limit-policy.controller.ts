import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KycTier } from '@prisma/client';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { TransactionLimitPolicyService } from '../../application/services/transaction-limit-policy.service';
import { UpdateTransactionLimitPolicyDto } from '../dto/transaction-limit-policy.dto';

/**
 * Brief §4.3.3: "TransactionLimitPolicy lookup (configurable, not
 * hard-coded)". Gated on Permission.CONFIG_WRITE for both read and write —
 * there is no separate CONFIG_READ permission in this codebase, and this is
 * sensitive compliance configuration, not a universally-needed dropdown
 * lookup like reference-data.
 */
@ApiTags('Transaction Limits')
@ApiBearerAuth('access-token')
@Controller('transaction-limits')
export class TransactionLimitPolicyController {
  constructor(private readonly policies: TransactionLimitPolicyService) {}

  @Get()
  @RequirePermissions(Permission.CONFIG_WRITE)
  @ApiOperation({
    summary: 'List transaction limit policies for all KYC tiers',
  })
  list() {
    return this.policies.listPolicies();
  }

  @Patch(':tier')
  @RequirePermissions(Permission.CONFIG_WRITE)
  @ApiOperation({
    summary:
      "Update a KYC tier's transaction limit policy — a config change, not a code change",
  })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('tier') tier: KycTier,
    @Body() dto: UpdateTransactionLimitPolicyDto,
  ) {
    return this.policies.updatePolicy(tier, dto, user.sub);
  }
}
