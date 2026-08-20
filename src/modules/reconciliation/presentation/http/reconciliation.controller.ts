import {
  Body,
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
import { ReconciliationService } from '../../application/services/reconciliation.service';
import {
  ReconciliationQueryDto,
  RunMatchDto,
  ResolveExceptionDto,
} from '../dto/reconciliation.dto';

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

/** Handoff §recon/§recondet. Read access is merchant-scoped — see MerchantScopeService. */
@ApiTags('Reconciliation')
@ApiBearerAuth('access-token')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly scope: MerchantScopeService,
  ) {}

  @Post('run')
  @RequirePermissions(Permission.RECONCILIATION_RESOLVE)
  @ApiOperation({
    summary: 'Re-run the ledger-vs-TIPS-report match for a merchant/cycle date',
  })
  runMatch(@Body() dto: RunMatchDto) {
    return this.reconciliation.runMatch(
      dto.merchantId,
      new Date(dto.cycleDate),
    );
  }

  @Get('exceptions')
  @RequirePermissions(Permission.RECONCILIATION_READ)
  @ApiOperation({
    summary:
      'Exception queue — filterable, paginated, merchant-scoped for merchant actors',
  })
  list(
    @Query() query: ReconciliationQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const merchantId = this.scope.scopeMerchantId(
      toActor(user),
      query.merchantId,
    );
    return this.reconciliation.list({ ...query, merchantId });
  }

  @Get('exceptions/:id')
  @RequirePermissions(Permission.RECONCILIATION_READ)
  @ApiOperation({ summary: 'Single exception detail' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const exception = await this.reconciliation.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), exception.merchantId);
    return exception;
  }

  @Post('exceptions/:id/resolve')
  @RequirePermissions(Permission.RECONCILIATION_RESOLVE)
  @ApiOperation({ summary: 'Resolve or write off an exception' })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveExceptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const exception = await this.reconciliation.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), exception.merchantId);
    return this.reconciliation.resolve(id, dto.status, dto.notes, user.sub);
  }
}
