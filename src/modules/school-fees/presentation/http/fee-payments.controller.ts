import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { InvoicePaymentService } from '../../application/services/invoice-payment.service';
import { PAYMENT_GATEWAY } from '../../application/ports/payment-gateway.port';
import type { PaymentGatewayInterface } from '../../application/ports/payment-gateway.port';
import { GatewayNotificationDto, InitiateMockPaymentDto } from '../dto/school-fee.dto';

@ApiTags('School Fee Payments') @ApiBearerAuth('access-token')
@Controller('school-fee-payments')
export class FeePaymentsController {
  constructor(
    private readonly payments: InvoicePaymentService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayInterface,
  ) {}
  @Get('lookup/:reference') @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  lookup(@Param('reference') reference: string) { return this.payments.lookupByReference(reference); }
  @Post('mock/initiate') @RequirePermissions(Permission.SCHOOL_PAYMENT_MOCK)
  initiate(@Body() dto: InitiateMockPaymentDto) { return this.gateway.initiatePayment(dto); }
  @Post('mock/notify') @RequirePermissions(Permission.SCHOOL_PAYMENT_MOCK)
  async notify(@Body() dto: GatewayNotificationDto) {
    const notification = await this.gateway.handlePaymentNotification({
      ...dto,
      outcome: dto.outcome ?? 'success',
      channel: dto.channel ?? 'MOCK',
    });
    return this.payments.applyFromGatewayNotification(notification);
  }
}
