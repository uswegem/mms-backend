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
import { Public } from '@infrastructure/auth/rbac/decorators/public.decorator';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { PaymentLinksService } from '../../application/services/payment-links.service';
import {
  ConfirmPaymentLinkDto,
  CreatePaymentLinkDto,
  ListPaymentLinksQueryDto,
} from '../dto/payment-link.dto';

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

/** Handoff §links. Public routes power the buyer-facing pay page — no merchant login exists for a buyer. */
@ApiTags('Payment Links')
@Controller()
export class PaymentLinksController {
  constructor(
    private readonly links: PaymentLinksService,
    private readonly scope: MerchantScopeService,
  ) {}

  @Get('payment-links')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.PAYMENT_LINK_READ)
  @ApiOperation({
    summary: 'List payment links — merchant-scoped for merchant actors',
  })
  list(
    @Query() query: ListPaymentLinksQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const actor = toActor(user);
    const merchantId = this.scope.scopeMerchantId(actor, query.merchantId);
    return this.links.list(user.acquirerId, merchantId, query.status);
  }

  @Get('payment-links/:id')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.PAYMENT_LINK_READ)
  @ApiOperation({
    summary: 'Payment link detail, for the merchant’s own share panel',
  })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const link = await this.links.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), link.merchantId);
    return link;
  }

  @Post('payment-links')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.PAYMENT_LINK_WRITE)
  @ApiOperation({
    summary: 'Create a payment link for the caller’s own merchant',
  })
  create(@Body() dto: CreatePaymentLinkDto, @CurrentUser() user: JwtPayload) {
    if (!user.merchantId) {
      throw new Error('Only a merchant-scoped user can create a payment link');
    }
    return this.links.create(user.acquirerId, user.merchantId, user.sub, dto);
  }

  @Post('payment-links/:id/cancel')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.PAYMENT_LINK_WRITE)
  @ApiOperation({ summary: 'Cancel an active payment link' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const link = await this.links.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), link.merchantId);
    return this.links.cancel(id, user.sub);
  }

  @Post('payment-links/:id/reissue')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.PAYMENT_LINK_WRITE)
  @ApiOperation({
    summary:
      'Reissue an expired or cancelled link with a fresh slug and expiry',
  })
  async reissue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const link = await this.links.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), link.merchantId);
    return this.links.reissue(id, user.sub);
  }

  @Public()
  @Get('payment-links/public/:slug')
  @ApiOperation({
    summary: 'Public pay-page data — no auth, same as any real payment link',
  })
  getPublic(@Param('slug') slug: string) {
    return this.links.getBySlug(slug);
  }

  @Public()
  @Post('payment-links/public/:slug/confirm')
  @ApiOperation({
    summary:
      'Match a just-created TIPS payment to this link (dev/UAT: called right after the webhook simulate-pay call)',
  })
  confirm(@Param('slug') slug: string, @Body() dto: ConfirmPaymentLinkDto) {
    return this.links.confirmPayment(slug, dto.tipsEndToEndId);
  }
}
