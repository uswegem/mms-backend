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
import { SettlementsService } from '../../application/services/settlements.service';
import { SettlementQueryDto } from '../dto/settlement.dto';

@ApiTags('Settlements')
@ApiBearerAuth('access-token')
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  @RequirePermissions(Permission.SETTLEMENTS_READ)
  @ApiOperation({ summary: 'Settlement cycles — filterable, paginated' })
  list(@Query() query: SettlementQueryDto) {
    return this.settlements.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.SETTLEMENTS_READ)
  @ApiOperation({ summary: 'Single settlement cycle detail' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.getById(id);
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
