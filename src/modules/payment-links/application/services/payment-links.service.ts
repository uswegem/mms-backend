import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentLinkStatus } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import {
  PaymentLinksRepository,
  PaymentLinkWithRelations,
  PublicPaymentLink,
} from '../../infrastructure/persistence/payment-links.repository';

export interface CreatePaymentLinkInput {
  itemName: string;
  orderRef: string;
  description?: string;
  amount: number;
  expiresInHours?: number;
}

const RECENCY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes — a buyer paying and confirming happen seconds apart

/**
 * Handoff §links (§4.5 Online). A payment link/storefront item is paid
 * through the exact same real TIPS webhook path (`POST /tips/webhook/
 * payment-confirmation`) as any other Lipa Namba payment — there is no
 * separate payment rail invented here. `confirmPayment` is the honest
 * seam: it looks up the Payment the buyer's browser just created via
 * that webhook and validates it actually belongs to this link (same
 * merchant, same amount, recent, SUCCESS) before marking the link PAID.
 * That validation is what stops a buyer from pointing an unrelated
 * payment at someone else's link.
 */
@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly links: PaymentLinksRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async create(
    acquirerId: string,
    merchantId: string,
    actorId: string,
    input: CreatePaymentLinkInput,
  ): Promise<PaymentLinkWithRelations> {
    const alias = await this.prisma.merchantAlias.findUnique({
      where: { merchantId },
    });
    if (!alias || !alias.isActive) {
      throw new BadRequestException(
        'This merchant has no active Lipa Namba alias to receive payment against — issue one before creating payment links',
      );
    }

    const expiresAt = new Date(
      Date.now() + (input.expiresInHours ?? 24) * 3_600_000,
    );

    const link = await this.links.create({
      acquirerId,
      merchantId,
      itemName: input.itemName,
      orderRef: input.orderRef,
      description: input.description,
      amount: input.amount,
      expiresAt,
      createdBy: actorId,
    });

    await this.audit.record({
      actorId,
      action: 'PAYMENT_LINK_CREATED',
      entityType: 'payment_link',
      entityId: link.id,
      metadata: { orderRef: input.orderRef, amount: input.amount },
    });

    return link;
  }

  async list(
    acquirerId: string,
    merchantId?: string,
    status?: PaymentLinkStatus,
  ): Promise<PaymentLinkWithRelations[]> {
    return this.links.findMany(acquirerId, merchantId, status);
  }

  async getById(id: string): Promise<PaymentLinkWithRelations> {
    const link = await this.links.findById(id);
    if (!link) throw new NotFoundException(`Payment link ${id} not found`);
    return link;
  }

  /** Public — powers the buyer-facing pay page. No merchant scoping: anyone with the slug can view it, same as a real payment link. */
  async getBySlug(slug: string): Promise<PublicPaymentLink> {
    const link = await this.links.findBySlug(slug);
    if (!link) throw new NotFoundException(`Payment link ${slug} not found`);
    return link;
  }

  async cancel(id: string, actorId: string): Promise<PaymentLinkWithRelations> {
    const link = await this.getById(id);
    if (link.status !== 'ACTIVE') {
      throw new ConflictException(
        `Cannot cancel a link that is already ${link.status.toLowerCase()}`,
      );
    }
    const updated = await this.links.setStatus(id, 'CANCELLED');
    await this.audit.record({
      actorId,
      action: 'PAYMENT_LINK_CANCELLED',
      entityType: 'payment_link',
      entityId: id,
    });
    return updated;
  }

  /** Handoff's "Reissue" action on an expired/cancelled link — same item, a fresh slug and expiry. */
  async reissue(
    id: string,
    actorId: string,
  ): Promise<PaymentLinkWithRelations> {
    const link = await this.getById(id);
    const expired = link.status === 'ACTIVE' && link.expiresAt < new Date();
    if (link.status !== 'CANCELLED' && !expired) {
      throw new ConflictException(
        'Only an expired or cancelled link can be reissued',
      );
    }

    const reissued = await this.links.create({
      acquirerId: link.acquirerId,
      merchantId: link.merchantId,
      itemName: link.itemName,
      orderRef: link.orderRef,
      description: link.description ?? undefined,
      amount: link.amount,
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
      createdBy: actorId,
    });

    await this.audit.record({
      actorId,
      action: 'PAYMENT_LINK_REISSUED',
      entityType: 'payment_link',
      entityId: reissued.id,
      metadata: { reissuedFrom: id },
    });

    return reissued;
  }

  /** Public — called by the buyer's browser right after the TIPS webhook call it just made. */
  async confirmPayment(
    slug: string,
    tipsEndToEndId: string,
  ): Promise<PublicPaymentLink> {
    const link = await this.links.findBySlug(slug);
    if (!link) throw new NotFoundException(`Payment link ${slug} not found`);
    if (link.status !== 'ACTIVE') {
      throw new ConflictException(
        `This link is already ${link.status.toLowerCase()}`,
      );
    }
    if (link.expiresAt < new Date()) {
      throw new ConflictException('This link has expired');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { tipsEndToEndId },
    });
    if (!payment) {
      throw new NotFoundException(`No payment found for ${tipsEndToEndId}`);
    }
    if (payment.merchantId !== link.merchantId) {
      throw new BadRequestException(
        'That payment does not belong to this link’s merchant',
      );
    }
    if (payment.status !== 'SUCCESS') {
      throw new BadRequestException(
        `Payment is ${payment.status}, not SUCCESS — cannot confirm`,
      );
    }
    if (Number(payment.amount) !== Number(link.amount)) {
      throw new BadRequestException(
        `Payment amount ${payment.amount.toString()} does not match the link amount ${link.amount.toString()}`,
      );
    }
    if (Date.now() - payment.receivedAt.getTime() > RECENCY_WINDOW_MS) {
      throw new BadRequestException(
        'That payment is too old to confirm against this link',
      );
    }

    const existingLinkForPayment = await this.prisma.paymentLink.findUnique({
      where: { paymentId: payment.id },
    });
    if (existingLinkForPayment) {
      throw new ConflictException(
        'This payment has already been matched to a different link',
      );
    }

    await this.links.markPaid(link.id, payment.id);
    await this.audit.record({
      actorId: null,
      action: 'PAYMENT_LINK_PAID',
      entityType: 'payment_link',
      entityId: link.id,
      metadata: { paymentId: payment.id, tipsEndToEndId },
    });

    return this.getBySlug(slug);
  }
}
