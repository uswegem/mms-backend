import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { MerchantScopeService } from '@modules/merchants/application/services/merchant-scope.service';
import { MerchantNotFoundException } from '@modules/merchants/domain/exceptions/merchant.exceptions';
import { MerchantStatusRepository } from '../../infrastructure/persistence/merchant-status.repository';
import { MerchantStatusLifecycleService } from '../../application/services/merchant-status-lifecycle.service';
import {
  AllowedStatusActionsDto,
  MerchantStatusHistoryDto,
  RequestStatusChangeDto,
  StatusChangeNotesDto,
} from '../dto/merchant-status.dto';
import { MerchantResponseDto } from '@modules/merchants/presentation/dto/merchant.dto';

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

@ApiTags('Merchant Status')
@ApiBearerAuth('access-token')
@Controller('merchants/:merchantId/status')
export class MerchantStatusController {
  constructor(
    private readonly lifecycle: MerchantStatusLifecycleService,
    private readonly scope: MerchantScopeService,
    private readonly statusRepo: MerchantStatusRepository,
  ) {}

  private async assertAccess(actor: ActorContext, merchantId: string) {
    const merchant = await this.statusRepo.findMerchantById(merchantId);
    if (!merchant) throw new MerchantNotFoundException(merchantId);
    this.scope.assertCanAccessMerchant(actor, merchant);
  }

  @Get('allowed-actions')
  @RequirePermissions(Permission.MERCHANT_READ)
  @ApiOperation({ summary: 'Get allowed status actions for current user' })
  async allowedActions(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
  ): Promise<AllowedStatusActionsDto> {
    const actor = toActor(user);
    await this.assertAccess(actor, merchantId);
    return this.lifecycle.getAllowedActions(merchantId, actor);
  }

  @Get('history')
  @RequirePermissions(Permission.MERCHANT_READ)
  @ApiOperation({ summary: 'Get merchant status change history' })
  async history(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
  ): Promise<MerchantStatusHistoryDto[]> {
    const actor = toActor(user);
    await this.assertAccess(actor, merchantId);
    return this.lifecycle.getHistory(merchantId);
  }

  @Post('submit-review')
  @RequirePermissions(Permission.MERCHANT_STATUS_SUBMIT)
  @ApiOperation({ summary: 'Submit merchant for review (Draft → Pending Review)' })
  async submitReview(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: StatusChangeNotesDto,
  ): Promise<MerchantResponseDto> {
    const actor = toActor(user);
    await this.assertAccess(actor, merchantId);
    return this.lifecycle.submitForReview(merchantId, actor, dto.notes);
  }

  @Post('pending-approval')
  @RequirePermissions(Permission.MERCHANT_STATUS_APPROVE)
  @ApiOperation({ summary: 'Move to pending approval (Pending Review → Pending Approval)' })
  async pendingApproval(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: StatusChangeNotesDto,
  ): Promise<MerchantResponseDto> {
    const actor = toActor(user);
    await this.assertAccess(actor, merchantId);
    return this.lifecycle.moveToPendingApproval(merchantId, actor, dto.notes);
  }

  @Post('approve')
  @RequirePermissions(Permission.MERCHANT_STATUS_CHECKER_APPROVE)
  @ApiOperation({ summary: 'Checker approve merchant (Pending Approval → Active)' })
  async approve(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: StatusChangeNotesDto,
  ): Promise<MerchantResponseDto> {
    const actor = toActor(user);
    await this.assertAccess(actor, merchantId);
    return this.lifecycle.approve(merchantId, actor, dto.notes);
  }

  @Post('reject')
  @RequirePermissions(Permission.MERCHANT_STATUS_REJECT)
  @ApiOperation({ summary: 'Reject merchant' })
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: StatusChangeNotesDto,
  ): Promise<MerchantResponseDto> {
    const actor = toActor(user);
    await this.assertAccess(actor, merchantId);
    return this.lifecycle.reject(merchantId, actor, dto.reason, dto.notes);
  }

  @Post('request')
  @RequirePermissions(Permission.MERCHANT_SUSPEND)
  @ApiOperation({ summary: 'Request a status change (creates a maker-checker approval task)' })
  async requestChange(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: RequestStatusChangeDto,
  ): Promise<MerchantResponseDto> {
    const actor = toActor(user);
    await this.assertAccess(actor, merchantId);
    return this.lifecycle.requestStatusChange(merchantId, actor, dto.action, dto.reason, dto.notes);
  }

}
