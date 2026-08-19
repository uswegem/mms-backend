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
import { KycUpgradeService } from '../../application/services/kyc-upgrade.service';
import { AddKycUpgradeDocumentDto, VerifyTinDto } from '../dto/kyc-upgrade.dto';

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

/** Handoff §kycup. The upgrade decision itself goes through /approvals — see KycUpgradeApprovalPort. */
@ApiTags('KYC Upgrade')
@ApiBearerAuth('access-token')
@Controller('kyc-upgrades')
export class KycUpgradeController {
  constructor(
    private readonly upgrades: KycUpgradeService,
    private readonly scope: MerchantScopeService,
  ) {}

  @Get('status')
  @RequirePermissions(Permission.MERCHANT_KYC_READ)
  @ApiOperation({
    summary:
      'Rolling 30-day volume vs. tier threshold, and any active upgrade request',
  })
  status(
    @Query('merchantId') merchantId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const resolved = this.scope.scopeMerchantId(toActor(user), merchantId);
    if (!resolved) {
      throw new Error('merchantId is required for non-merchant-scoped actors');
    }
    return this.upgrades.getStatus(resolved);
  }

  @Post()
  @RequirePermissions(Permission.MERCHANT_KYC_WRITE)
  @ApiOperation({
    summary: 'Start a KYC tier upgrade for the caller’s own merchant',
  })
  start(@CurrentUser() user: JwtPayload) {
    if (!user.merchantId) {
      throw new Error('Only a merchant-scoped user can start a KYC upgrade');
    }
    return this.upgrades.startUpgrade(
      user.acquirerId,
      user.merchantId,
      user.sub,
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.MERCHANT_KYC_READ)
  @ApiOperation({ summary: 'KYC upgrade request detail' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const request = await this.upgrades.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), request.merchantId);
    return request;
  }

  @Post(':id/verify-tin')
  @RequirePermissions(Permission.MERCHANT_KYC_WRITE)
  @ApiOperation({ summary: 'Re-verify TIN against TRA for the upgrade' })
  async verifyTin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyTinDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const request = await this.upgrades.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), request.merchantId);
    return this.upgrades.verifyTin(id, user.sub, dto.tin);
  }

  @Post(':id/documents')
  @RequirePermissions(Permission.MERCHANT_KYC_WRITE)
  @ApiOperation({ summary: 'Attach a business-registration document' })
  async addDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddKycUpgradeDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const request = await this.upgrades.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), request.merchantId);
    return this.upgrades.addDocument(id, user.sub, dto);
  }

  @Post(':id/submit')
  @RequirePermissions(Permission.MERCHANT_KYC_WRITE)
  @ApiOperation({ summary: 'Submit for checker approval' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const request = await this.upgrades.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), request.merchantId);
    return this.upgrades.submitForApproval(id, user.sub);
  }
}
