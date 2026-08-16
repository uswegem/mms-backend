import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { PaymentLedgerService } from '../../application/services/payment-ledger.service';
import { SchoolAccessService } from '../../application/services/school-access.service';
import { PaymentListQueryDto, ResolveDisputeDto, ReversePaymentDto } from '../dto/recon.dto';

@ApiTags('School Payment Ledger')
@ApiBearerAuth('access-token')
@Controller()
export class PaymentLedgerController {
  constructor(private readonly ledger: PaymentLedgerService, private readonly access: SchoolAccessService) {}

  @Get('schools/:merchantId/payment-ledger')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  async listSchool(@CurrentUser() user: JwtPayload, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Query() query: PaymentListQueryDto) {
    await this.assertAccess(user, merchantId);
    return this.ledger.listPayments({ merchantId, ...this.toFilters(query) });
  }

  @Get('platform/school-fee-payments')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  listPlatform(@Query('merchantId') merchantId: string | undefined, @Query() query: PaymentListQueryDto) {
    return this.ledger.listPayments({ merchantId, ...this.toFilters(query) });
  }

  @Get('schools/:merchantId/payment-ledger/daily-summary')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  async dailySummary(@CurrentUser() user: JwtPayload, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Query('date') date: string) {
    await this.assertAccess(user, merchantId); return this.ledger.dailySummary(merchantId, new Date(date));
  }

  @Get('schools/:merchantId/payment-ledger/students/:studentId/statement')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  async statement(@CurrentUser() user: JwtPayload, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('studentId', ParseUUIDPipe) studentId: string) {
    await this.assertAccess(user, merchantId); return this.ledger.studentStatementChronological(merchantId, studentId);
  }

  @Get('schools/:merchantId/payment-ledger/:paymentId')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  async detail(@CurrentUser() user: JwtPayload, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string) {
    await this.assertAccess(user, merchantId); const payment = await this.assertPaymentMerchant(paymentId, merchantId);
    return payment;
  }

  @Post('schools/:merchantId/payment-ledger/:paymentId/reverse')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_REVERSE)
  async reverse(@CurrentUser() user: JwtPayload, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Body() body: ReversePaymentDto) {
    await this.assertAccess(user, merchantId); await this.assertPaymentMerchant(paymentId, merchantId); return this.ledger.reversePayment(paymentId, body.reason, user.sub);
  }

  @Post('schools/:merchantId/payment-ledger/:paymentId/dispute')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_REVERSE)
  async dispute(@CurrentUser() user: JwtPayload, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Body() body: ReversePaymentDto) {
    await this.assertAccess(user, merchantId); await this.assertPaymentMerchant(paymentId, merchantId); return this.ledger.disputePayment(paymentId, body.reason, user.sub);
  }

  @Post('schools/:merchantId/payment-ledger/:paymentId/resolve-dispute')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_REVERSE)
  async resolve(@CurrentUser() user: JwtPayload, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Body() body: ResolveDisputeDto) {
    await this.assertAccess(user, merchantId); await this.assertPaymentMerchant(paymentId, merchantId); return this.ledger.resolveDispute(paymentId, body.resolution, body.reason, user.sub);
  }

  private toFilters(query: PaymentListQueryDto) { return { ...query, dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined, dateTo: query.dateTo ? new Date(query.dateTo) : undefined }; }
  private assertAccess(user: JwtPayload, merchantId: string) { return this.access.assertActorCanAccessSchool({ sub: user.sub, email: user.email, acquirerId: user.acquirerId, merchantId: user.merchantId, roles: user.roles, permissions: user.permissions }, merchantId); }
  private async assertPaymentMerchant(paymentId: string, merchantId: string) {
    const payment = await this.ledger.getPaymentDetail(paymentId);
    if (payment.merchantId !== merchantId) throw new BadRequestException('Payment does not belong to school');
    return payment;
  }
}
