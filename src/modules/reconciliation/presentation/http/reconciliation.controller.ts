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
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { ReconciliationService } from '../../application/services/reconciliation.service';
import {
  ReconciliationQueryDto,
  RunMatchDto,
  ResolveExceptionDto,
} from '../dto/reconciliation.dto';

@ApiTags('Reconciliation')
@ApiBearerAuth('access-token')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post('run')
  @RequirePermissions(Permission.RECONCILIATION_READ)
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
  @ApiOperation({ summary: 'Exception queue — filterable, paginated' })
  list(@Query() query: ReconciliationQueryDto) {
    return this.reconciliation.list(query);
  }

  @Get('exceptions/:id')
  @RequirePermissions(Permission.RECONCILIATION_READ)
  @ApiOperation({ summary: 'Single exception detail' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliation.getById(id);
  }

  @Post('exceptions/:id/resolve')
  @RequirePermissions(Permission.RECONCILIATION_RESOLVE)
  @ApiOperation({ summary: 'Resolve or write off an exception' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveExceptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reconciliation.resolve(id, dto.status, dto.notes, user.sub);
  }
}
