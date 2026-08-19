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
import { FeeScheduleService } from '../../application/services/fee-schedule.service';
import {
  CreateFeeScheduleDto,
  ListFeeSchedulesQueryDto,
} from '../dto/fee-schedule.dto';

/** Handoff §cfgfees: system configuration — MDR and transaction fees. */
@ApiTags('Fee Schedules')
@ApiBearerAuth('access-token')
@Controller('fee-schedules')
export class FeeScheduleController {
  constructor(private readonly feeSchedules: FeeScheduleService) {}

  @Get()
  @RequirePermissions(Permission.FEE_SCHEDULE_READ)
  @ApiOperation({
    summary: 'List fee schedules, newest version first per scope',
  })
  list(@Query() query: ListFeeSchedulesQueryDto) {
    return this.feeSchedules.list(query);
  }

  @Get('resolve')
  @RequirePermissions(Permission.FEE_SCHEDULE_READ)
  @ApiOperation({
    summary: 'Preview the schedule a given merchant is actually billed under',
  })
  resolve(@Query('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.feeSchedules.resolveForMerchant(merchantId);
  }

  @Get(':id')
  @RequirePermissions(Permission.FEE_SCHEDULE_READ)
  @ApiOperation({ summary: 'Single fee schedule with its charge lines' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.feeSchedules.getById(id);
  }

  @Post()
  @RequirePermissions(Permission.FEE_SCHEDULE_WRITE)
  @ApiOperation({
    summary: 'Draft a new fee schedule (not usable until activated)',
  })
  create(@Body() dto: CreateFeeScheduleDto, @CurrentUser() user: JwtPayload) {
    return this.feeSchedules.create(dto, user.sub);
  }

  @Post(':id/activate')
  @RequirePermissions(Permission.FEE_SCHEDULE_APPROVE)
  @ApiOperation({
    summary:
      'Activate a draft — supersedes the prior ACTIVE schedule for the same scope',
  })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.feeSchedules.activate(id, user.sub);
  }
}
