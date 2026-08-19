import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApprovalEntityType } from '@prisma/client';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { MakerCheckerService } from '../../application/services/maker-checker.service';
import { UpdateApprovalPolicyDto } from '../dto/approval.dto';

/**
 * Handoff §cfgmc: "Which functions require dual control, and at what
 * level." Gated on Permission.CONFIG_WRITE for both read and write, same
 * rationale as TransactionLimitPolicyController — sensitive compliance
 * configuration, not a universally-needed lookup, and there is no
 * separate CONFIG_READ permission in this codebase.
 */
@ApiTags('Approval Policies')
@ApiBearerAuth('access-token')
@Controller('approvals/policies')
export class ApprovalPolicyController {
  constructor(private readonly makerChecker: MakerCheckerService) {}

  @Get()
  @RequirePermissions(Permission.CONFIG_WRITE)
  @ApiOperation({
    summary:
      'List maker-checker activity policies (only activities with a real workflow gate)',
  })
  list(@CurrentUser() user: JwtPayload) {
    return this.makerChecker.listPolicies(user.acquirerId);
  }

  @Patch(':entityType')
  @RequirePermissions(Permission.CONFIG_WRITE)
  @ApiOperation({
    summary: 'Update dual-control toggle and SLA for an activity',
  })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('entityType') entityType: ApprovalEntityType,
    @Body() dto: UpdateApprovalPolicyDto,
  ) {
    return this.makerChecker.updatePolicy(
      user.acquirerId,
      entityType,
      dto.enabled,
      dto.slaHours,
      user.sub,
    );
  }
}
