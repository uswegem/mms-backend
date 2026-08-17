import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentChannel, PaymentStatus } from '@prisma/client';
import { AliasRepository } from '@modules/alias/infrastructure/persistence/alias.repository';
import { PaymentEventsPublisher } from '@modules/realtime/payment-events.port';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import {
  TransactionsRepository,
  LedgerFilters,
} from '../../infrastructure/persistence/transactions.repository';
import { TipsPaymentProvider } from '../ports/tips-payment.port';
import {
  TipsPaymentWebhookDto,
  LedgerQueryDto,
  OverridePaymentStatusDto,
} from '../../presentation/dto/transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly aliases: AliasRepository,
    private readonly tips: TipsPaymentProvider,
    private readonly events: PaymentEventsPublisher,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Ingests a TIPS payment confirmation. Idempotent on tipsEndToEndId — a
   * retried webhook delivery (network blip, TIPS's own retry policy)
   * returns the already-recorded payment rather than double-counting it.
   */
  async recordConfirmation(
    dto: TipsPaymentWebhookDto,
    rawBody: string,
    signature?: string,
  ) {
    if (!this.tips.verifyWebhookSignature(rawBody, signature)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const existing = await this.transactions.findByTipsEndToEndId(
      dto.tipsEndToEndId,
    );
    if (existing) return existing;

    const resolved = await this.aliases.findByAlias(dto.alias);
    if (!resolved) {
      throw new BadRequestException(
        `No merchant or student is registered under alias ${dto.alias}`,
      );
    }
    const merchant = resolved.record.merchant;
    if (!merchant) {
      throw new BadRequestException(
        `Alias ${dto.alias} has no linked merchant`,
      );
    }

    const status =
      dto.simulateOutcome === 'FAILED'
        ? PaymentStatus.FAILED
        : PaymentStatus.SUCCESS;
    const now = new Date();

    const payment = await this.transactions.create({
      acquirerId: merchant.acquirerId,
      merchantId: merchant.id,
      tipsEndToEndId: dto.tipsEndToEndId,
      amount: dto.amount,
      status,
      channel: dto.channel ?? PaymentChannel.LIPA_NAMBA,
      payerFsp: dto.payerFsp,
      payerMsisdnMasked: dto.payerMsisdnMasked,
      payerNameMasked: dto.payerNameMasked,
      tipsSettledAt: status === PaymentStatus.SUCCESS ? now : undefined,
      receivedAt: now,
    });

    await this.audit.record({
      actorId: null, // TIPS-initiated, not a human actor
      action: 'PAYMENT_RECEIVED',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        tipsEndToEndId: dto.tipsEndToEndId,
        alias: dto.alias,
        status,
      },
    });

    if (status === PaymentStatus.SUCCESS) {
      this.events.publishPaymentConfirmed(merchant.id, {
        paymentId: payment.id,
        tipsEndToEndId: payment.tipsEndToEndId,
        amount: payment.amount.toString(),
        currency: payment.currency,
        channel: payment.channel,
        storeId: payment.storeId,
        terminalId: payment.terminalId,
        payerFsp: payment.payerFsp,
        receivedAt: payment.receivedAt.toISOString(),
      });
    }

    return payment;
  }

  async list(query: LedgerQueryDto) {
    const filters: LedgerFilters = {
      merchantId: query.merchantId,
      storeId: query.storeId,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.transactions.list(filters);
  }

  async getById(id: string) {
    const payment = await this.transactions.findById(id);
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /** Ops manual override (brief §4.5) for a payment reconciliation couldn't auto-resolve. */
  async overrideStatus(
    id: string,
    dto: OverridePaymentStatusDto,
    actorId: string,
  ) {
    const payment = await this.getById(id);
    const updated = await this.transactions.updateStatus(
      id,
      dto.status,
      dto.status === PaymentStatus.SUCCESS ? new Date() : undefined,
    );

    await this.audit.record({
      actorId,
      action: 'PAYMENT_STATUS_OVERRIDE',
      entityType: 'payment',
      entityId: id,
      metadata: { from: payment.status, to: dto.status, reason: dto.reason },
    });

    return updated;
  }
}
