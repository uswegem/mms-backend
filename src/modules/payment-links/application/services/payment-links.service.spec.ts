import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentLinksService } from './payment-links.service';

function buildLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'link-1',
    acquirerId: 'acquirer-1',
    merchantId: 'merchant-1',
    itemName: 'Kitenge dress',
    orderRef: 'IG-DM-3391',
    description: null,
    amount: new Prisma.Decimal(85000),
    currency: 'TZS',
    slug: 'abc12345',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3_600_000),
    paymentId: null,
    paidAt: null,
    createdAt: new Date(),
    createdBy: 'actor-1',
    ...overrides,
  };
}

function buildPayment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'payment-1',
    merchantId: 'merchant-1',
    status: 'SUCCESS',
    amount: new Prisma.Decimal(85000),
    tipsEndToEndId: 'TIPS-LINK-1',
    receivedAt: new Date(),
    ...overrides,
  };
}

function buildService() {
  const links = {
    create: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn(),
    findMany: jest.fn(),
    markPaid: jest.fn(),
    setStatus: jest.fn(),
  };
  const prisma = {
    merchantAlias: { findUnique: jest.fn() },
    payment: { findUnique: jest.fn() },
    paymentLink: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentLinksService(
    links as never,
    prisma as never,
    audit as never,
  );
  return { service, links, prisma, audit };
}

describe('PaymentLinksService', () => {
  describe('create', () => {
    it('rejects a merchant with no active alias', async () => {
      const { service, prisma } = buildService();
      prisma.merchantAlias.findUnique.mockResolvedValue(null);

      await expect(
        service.create('acquirer-1', 'merchant-1', 'actor-1', {
          itemName: 'Kitenge dress',
          orderRef: 'IG-DM-3391',
          amount: 85000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the link and records an audit entry', async () => {
      const { service, prisma, links, audit } = buildService();
      prisma.merchantAlias.findUnique.mockResolvedValue({ isActive: true });
      links.create.mockResolvedValue(buildLink());

      const result = await service.create(
        'acquirer-1',
        'merchant-1',
        'actor-1',
        {
          itemName: 'Kitenge dress',
          orderRef: 'IG-DM-3391',
          amount: 85000,
        },
      );

      expect(links.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemName: 'Kitenge dress',
          orderRef: 'IG-DM-3391',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_LINK_CREATED',
          entityId: 'link-1',
        }),
      );
      expect(result.id).toBe('link-1');
    });
  });

  describe('cancel', () => {
    it('rejects cancelling an already-paid link', async () => {
      const { service, links } = buildService();
      links.findById.mockResolvedValue(buildLink({ status: 'PAID' }));

      await expect(service.cancel('link-1', 'actor-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('reissue', () => {
    it('rejects reissuing a still-active, unexpired link', async () => {
      const { service, links } = buildService();
      links.findById.mockResolvedValue(buildLink({ status: 'ACTIVE' }));

      await expect(service.reissue('link-1', 'actor-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('reissues an expired link with a fresh slug', async () => {
      const { service, links, audit } = buildService();
      links.findById.mockResolvedValue(
        buildLink({ status: 'ACTIVE', expiresAt: new Date(Date.now() - 1000) }),
      );
      links.create.mockResolvedValue(
        buildLink({ id: 'link-2', slug: 'zzz99999' }),
      );

      const result = await service.reissue('link-1', 'actor-1');

      expect(result.id).toBe('link-2');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_LINK_REISSUED',
          metadata: { reissuedFrom: 'link-1' },
        }),
      );
    });
  });

  describe('confirmPayment', () => {
    it('rejects when no payment link exists for the slug', async () => {
      const { service, links } = buildService();
      links.findBySlug.mockResolvedValue(null);

      await expect(service.confirmPayment('missing', 'TIPS-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a payment belonging to a different merchant', async () => {
      const { service, links, prisma } = buildService();
      links.findBySlug.mockResolvedValue(buildLink());
      prisma.payment.findUnique.mockResolvedValue(
        buildPayment({ merchantId: 'other-merchant' }),
      );

      await expect(
        service.confirmPayment('abc12345', 'TIPS-LINK-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a payment whose amount does not match the link', async () => {
      const { service, links, prisma } = buildService();
      links.findBySlug.mockResolvedValue(buildLink());
      prisma.payment.findUnique.mockResolvedValue(
        buildPayment({ amount: new Prisma.Decimal(1000) }),
      );

      await expect(
        service.confirmPayment('abc12345', 'TIPS-LINK-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks the link PAID for a real, matching, recent payment', async () => {
      const { service, links, prisma, audit } = buildService();
      links.findBySlug
        .mockResolvedValueOnce(buildLink())
        .mockResolvedValueOnce(
          buildLink({ status: 'PAID', paymentId: 'payment-1' }),
        );
      prisma.payment.findUnique.mockResolvedValue(buildPayment());

      const result = await service.confirmPayment('abc12345', 'TIPS-LINK-1');

      expect(links.markPaid).toHaveBeenCalledWith('link-1', 'payment-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_LINK_PAID' }),
      );
      expect(result.status).toBe('PAID');
    });
  });
});
