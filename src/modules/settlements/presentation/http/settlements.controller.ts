import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { SettlementsService } from '../../application/services/settlements.service';
import { SettlementQueryDto } from '../dto/settlement.dto';

function toActor(user: JwtPayload): ActorContext {
  return {
    sub: user.sub,
    email: user.email,
    acquirerId: user.acquirerId,
    merchantId: user.merchantId,
    roles: user.roles,
    permissions: user.permissions,
  };
}

@ApiTags('Settlements')
@ApiBearerAuth('access-token')
@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly scope: MerchantScopeService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SETTLEMENTS_READ)
  @ApiOperation({
    summary:
      'Settlement cycles — filterable, paginated. Merchant-scoped actors only ever see their own merchant.',
  })
  list(@Query() query: SettlementQueryDto, @CurrentUser() user: JwtPayload) {
    const actor = toActor(user);
    return this.settlements.list({
      ...query,
      merchantId: this.scope.scopeMerchantId(actor, query.merchantId),
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.SETTLEMENTS_READ)
  @ApiOperation({ summary: 'Single settlement cycle detail' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const cycle = await this.settlements.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), cycle.merchantId);
    return cycle;
  }

  @Post('sweep')
  @RequirePermissions(Permission.SETTLEMENTS_APPROVE)
  @ApiOperation({
    summary:
      'Manually trigger the sweep (design prototype\'s "Re-run" action) — normally runs nightly at 02:00',
  })
  runSweep() {
    return this.settlements.sweepAndPost();
  }
}
