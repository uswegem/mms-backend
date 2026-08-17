import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '@infrastructure/auth/rbac/decorators/public.decorator';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { TransactionsService } from '../../application/services/transactions.service';
import {
  TipsPaymentWebhookDto,
  LedgerQueryDto,
  OverridePaymentStatusDto,
} from '../dto/transaction.dto';

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

@ApiTags('Transactions')
@Controller()
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly scope: MerchantScopeService,
  ) {}

  @Public()
  @Post('tips/webhook/payment-confirmation')
  @ApiOperation({
    summary: 'TIPS payment confirmation callback (mock adapter in dev/UAT)',
  })
  receiveConfirmation(
    @Body() dto: TipsPaymentWebhookDto,
    @Req() req: Request,
    @Headers('x-tips-signature') signature?: string,
  ) {
    // req.body is already the parsed JSON at this point (Express); the raw
    // string is only meaningful once real TIPS's own signature scheme
    // replaces the shared-secret mock (see TipsPaymentProvider).
    return this.transactions.recordConfirmation(
      dto,
      JSON.stringify(req.body),
      signature,
    );
  }

  @Get('transactions')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.TRANSACTIONS_READ)
  @ApiOperation({
    summary:
      'Transaction ledger — filterable, paginated. Merchant-scoped actors only ever see their own merchant.',
  })
  list(@Query() query: LedgerQueryDto, @CurrentUser() user: JwtPayload) {
    const actor = toActor(user);
    return this.transactions.list({
      ...query,
      merchantId: this.scope.scopeMerchantId(actor, query.merchantId),
    });
  }

  @Get('transactions/:id')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.TRANSACTIONS_READ)
  @ApiOperation({ summary: 'Single transaction detail' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const payment = await this.transactions.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), payment.merchantId);
    return payment;
  }

  @Patch('transactions/:id/status')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.TRANSACTIONS_OVERRIDE)
  @ApiOperation({
    summary: 'Manual status override for a stuck/disputed payment',
  })
  async overrideStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverridePaymentStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const payment = await this.transactions.getById(id);
    this.scope.assertCanAccessMerchant(toActor(user), payment.merchantId);
    return this.transactions.overrideStatus(id, dto, user.sub);
  }
}
