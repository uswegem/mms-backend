import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PaymentLinkStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

const linkInclude = {
  payment: true,
} satisfies Prisma.PaymentLinkInclude;

const publicLinkInclude = {
  payment: true,
  merchant: {
    select: {
      tradingName: true,
      displayName: true,
      merchantAlias: { select: { alias8digit: true } },
    },
  },
} satisfies Prisma.PaymentLinkInclude;

export type PaymentLinkWithRelations = Prisma.PaymentLinkGetPayload<{
  include: typeof linkInclude;
}>;

export type PublicPaymentLink = Prisma.PaymentLinkGetPayload<{
  include: typeof publicLinkInclude;
}>;

@Injectable()
export class PaymentLinksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 8-char URL-safe slug — collision odds are negligible at this volume; retried by the caller on the rare unique violation. */
  private generateSlug(): string {
    return randomBytes(6).toString('base64url').slice(0, 8);
  }

  async create(data: {
    acquirerId: string;
    merchantId: string;
    itemName: string;
    orderRef: string;
    description?: string;
    amount: Prisma.Decimal | number | string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<PaymentLinkWithRelations> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.paymentLink.create({
          data: { ...data, slug: this.generateSlug() },
          include: linkInclude,
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < 4
        ) {
          continue; // slug collision — regenerate and retry
        }
        throw err;
      }
    }
    throw new Error('Could not generate a unique payment link slug');
  }

  async findById(id: string): Promise<PaymentLinkWithRelations | null> {
    return this.prisma.paymentLink.findUnique({
      where: { id },
      include: linkInclude,
    });
  }

  async findBySlug(slug: string): Promise<PublicPaymentLink | null> {
    return this.prisma.paymentLink.findUnique({
      where: { slug },
      include: publicLinkInclude,
    });
  }

  async findMany(
    acquirerId: string,
    merchantId?: string,
    status?: PaymentLinkStatus,
  ): Promise<PaymentLinkWithRelations[]> {
    return this.prisma.paymentLink.findMany({
      where: {
        acquirerId,
        ...(merchantId ? { merchantId } : {}),
        ...(status ? { status } : {}),
      },
      include: linkInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async markPaid(
    id: string,
    paymentId: string,
  ): Promise<PaymentLinkWithRelations> {
    return this.prisma.paymentLink.update({
      where: { id },
      data: { status: 'PAID', paymentId, paidAt: new Date() },
      include: linkInclude,
    });
  }

  async setStatus(
    id: string,
    status: PaymentLinkStatus,
  ): Promise<PaymentLinkWithRelations> {
    return this.prisma.paymentLink.update({
      where: { id },
      data: { status },
      include: linkInclude,
    });
  }
}
