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
import { DisputesService } from '../../application/services/disputes.service';
import {
  AddDisputeEvidenceDto,
  CreateDisputeDto,
  ListDisputesQueryDto,
  ResolveNoRefundDto,
} from '../dto/dispute.dto';

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

/** Handoff §disputes/§disputedet. Refund decisions go through /approvals — see DisputeRefundApprovalPort. */
@ApiTags('Disputes')
@ApiBearerAuth('access-token')
@Controller('disputes')
export class DisputesController {
  constructor(
    private readonly disputes: DisputesService,
    private readonly scope: MerchantScopeService,
  ) {}

  @Get()
  @RequirePermissions(Permission.DISPUTE_READ)
  @ApiOperation({
    summary:
      'List disputes — merchant-scoped actors only ever see their own merchant',
  })
  list(@Query() query: ListDisputesQueryDto, @CurrentUser() user: JwtPayload) {
    const actor = toActor(user);
    const merchantId = this.scope.scopeMerchantId(actor, query.merchantId);
    return this.disputes.list(
      user.acquirerId,
      merchantId,
      query.stage,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.DISPUTE_READ)
  @ApiOperation({
    summary: 'Dispute case detail, including evidence and the linked payment',
  })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const dispute = await this.disputes.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), dispute.merchantId);
    return dispute;
  }

  @Post()
  @RequirePermissions(Permission.DISPUTE_WRITE)
  @ApiOperation({ summary: 'Log a dispute against a real payment' })
  create(@Body() dto: CreateDisputeDto, @CurrentUser() user: JwtPayload) {
    const actor = toActor(user);
    this.scope.assertCanAccessMerchant(actor, dto.merchantId);
    return this.disputes.create(user.acquirerId, user.sub, dto);
  }

  @Post(':id/evidence')
  @RequirePermissions(Permission.DISPUTE_WRITE)
  @ApiOperation({ summary: 'Attach evidence to a dispute' })
  async addEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDisputeEvidenceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const dispute = await this.disputes.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), dispute.merchantId);
    return this.disputes.addEvidence(id, user.sub, dto);
  }

  @Post(':id/request-evidence')
  @RequirePermissions(Permission.DISPUTE_WRITE)
  @ApiOperation({ summary: 'Mark a dispute as awaiting more evidence' })
  async requestEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const dispute = await this.disputes.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), dispute.merchantId);
    return this.disputes.requestEvidence(id, user.sub);
  }

  @Post(':id/initiate-refund')
  @RequirePermissions(Permission.DISPUTE_WRITE)
  @ApiOperation({
    summary: 'Maker action — sends the refund to the checker queue',
  })
  async initiateRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const dispute = await this.disputes.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), dispute.merchantId);
    return this.disputes.initiateRefund(id, user.sub);
  }

  @Post(':id/resolve-no-refund')
  @RequirePermissions(Permission.DISPUTE_WRITE)
  @ApiOperation({ summary: 'Close a dispute without a refund' })
  async resolveWithoutRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveNoRefundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const dispute = await this.disputes.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), dispute.merchantId);
    return this.disputes.resolveWithoutRefund(id, user.sub, dto.notes);
  }
}
