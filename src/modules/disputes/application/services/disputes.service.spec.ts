import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DisputesService } from './disputes.service';

function buildPayment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'payment-1',
    acquirerId: 'acquirer-1',
    merchantId: 'merchant-1',
    amount: new Prisma.Decimal(64000),
    ...overrides,
  };
}

function buildDispute(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dispute-1',
    acquirerId: 'acquirer-1',
    caseNo: 'DSP-2026-00001',
    merchantId: 'merchant-1',
    paymentId: 'payment-1',
    stage: 'INVESTIGATION',
    ...overrides,
  };
}

function buildService() {
  const disputes = {
    create: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    addEvidence: jest.fn(),
    updateStage: jest.fn(),
  };
  const prisma = {
    payment: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const makerChecker = { createTask: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new DisputesService(
    disputes as never,
    prisma as never,
    makerChecker as never,
    audit as never,
  );
  return { service, disputes, prisma, makerChecker, audit };
}

describe('DisputesService', () => {
  describe('create', () => {
    it('rejects a payment that does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.create('acquirer-1', 'actor-1', {
          merchantId: 'merchant-1',
          paymentId: 'payment-1',
          raisedBy: 'MERCHANT',
          reason: 'DUPLICATE_PAYMENT',
          description: 'paid twice',
          disputedAmount: 1000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a payment belonging to a different merchant', async () => {
      const { service, prisma } = buildService();
      prisma.payment.findUnique.mockResolvedValue(
        buildPayment({ merchantId: 'other-merchant' }),
      );

      await expect(
        service.create('acquirer-1', 'actor-1', {
          merchantId: 'merchant-1',
          paymentId: 'payment-1',
          raisedBy: 'MERCHANT',
          reason: 'DUPLICATE_PAYMENT',
          description: 'paid twice',
          disputedAmount: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a disputed amount greater than the payment amount', async () => {
      const { service, prisma } = buildService();
      prisma.payment.findUnique.mockResolvedValue(buildPayment());

      await expect(
        service.create('acquirer-1', 'actor-1', {
          merchantId: 'merchant-1',
          paymentId: 'payment-1',
          raisedBy: 'MERCHANT',
          reason: 'DUPLICATE_PAYMENT',
          description: 'paid twice',
          disputedAmount: 999999,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the dispute and records an audit entry', async () => {
      const { service, prisma, disputes, audit } = buildService();
      prisma.payment.findUnique.mockResolvedValue(buildPayment());
      disputes.create.mockResolvedValue(buildDispute());

      await service.create('acquirer-1', 'actor-1', {
        merchantId: 'merchant-1',
        paymentId: 'payment-1',
        raisedBy: 'MERCHANT',
        reason: 'DUPLICATE_PAYMENT',
        description: 'paid twice',
        disputedAmount: 64000,
      });

      expect(disputes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-1',
          paymentId: 'payment-1',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DISPUTE_LOGGED',
          entityId: 'dispute-1',
        }),
      );
      // PaymentStatus.DISPUTED existed in the schema with no writer anywhere.
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { status: 'DISPUTED' },
      });
    });
  });

  describe('initiateRefund', () => {
    it('rejects initiating a refund on an already-resolved dispute', async () => {
      const { service, disputes } = buildService();
      disputes.findById.mockResolvedValue(
        buildDispute({ stage: 'RESOLVED_REFUNDED' }),
      );

      await expect(
        service.initiateRefund('dispute-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a real DISPUTE_REFUND approval task, moves the stage, and marks the payment REFUND_PENDING', async () => {
      const { service, disputes, makerChecker, prisma } = buildService();
      disputes.findById.mockResolvedValue(
        buildDispute({ stage: 'INVESTIGATION' }),
      );
      disputes.updateStage.mockResolvedValue(
        buildDispute({ stage: 'REFUND_PENDING_CHECKER' }),
      );

      await service.initiateRefund('dispute-1', 'actor-1');

      expect(makerChecker.createTask).toHaveBeenCalledWith(
        'acquirer-1',
        'DISPUTE_REFUND',
        'dispute-1',
        'actor-1',
      );
      expect(disputes.updateStage).toHaveBeenCalledWith(
        'dispute-1',
        'REFUND_PENDING_CHECKER',
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { status: 'REFUND_PENDING' },
      });
    });
  });

  describe('onCheckerApproved / onCheckerRejected — DisputeRefundApprovalPort', () => {
    it('moves an approved dispute to RESOLVED_REFUNDED, marks the payment REVERSED, and audits the checker', async () => {
      const { service, disputes, prisma, audit } = buildService();
      disputes.findById.mockResolvedValue(buildDispute());

      await service.onCheckerApproved('dispute-1', 'checker-1');

      const [id, stage, extra] = disputes.updateStage.mock.calls[0] as [
        string,
        string,
        { resolvedAt: Date },
      ];
      expect(id).toBe('dispute-1');
      expect(stage).toBe('RESOLVED_REFUNDED');
      expect(extra.resolvedAt).toBeInstanceOf(Date);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { status: 'REVERSED' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'checker-1',
          action: 'DISPUTE_REFUND_APPROVED',
          entityId: 'dispute-1',
        }),
      );
    });

    it('moves a rejected dispute to REJECTED with the checker notes, restores the payment to SUCCESS, and audits the checker', async () => {
      const { service, disputes, prisma, audit } = buildService();
      disputes.findById.mockResolvedValue(buildDispute());

      await service.onCheckerRejected(
        'dispute-1',
        'checker-1',
        'insufficient evidence',
      );

      expect(disputes.updateStage).toHaveBeenCalledWith(
        'dispute-1',
        'REJECTED',
        expect.objectContaining({ resolutionNotes: 'insufficient evidence' }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { status: 'SUCCESS' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'checker-1',
          action: 'DISPUTE_REFUND_REJECTED',
          entityId: 'dispute-1',
          metadata: { notes: 'insufficient evidence' },
        }),
      );
    });
  });

  describe('resolveWithoutRefund', () => {
    it('rejects closing a dispute already in a terminal stage', async () => {
      const { service, disputes } = buildService();
      disputes.findById.mockResolvedValue(buildDispute({ stage: 'REJECTED' }));

      await expect(
        service.resolveWithoutRefund(
          'dispute-1',
          'actor-1',
          'no action needed',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('closes the dispute without a refund and restores the payment to SUCCESS', async () => {
      const { service, disputes, prisma, audit } = buildService();
      disputes.findById.mockResolvedValue(
        buildDispute({ stage: 'INVESTIGATION' }),
      );
      disputes.updateStage.mockResolvedValue(
        buildDispute({ stage: 'RESOLVED_NO_REFUND' }),
      );

      await service.resolveWithoutRefund(
        'dispute-1',
        'actor-1',
        'no action needed',
      );

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { status: 'SUCCESS' },
      });
      expect(disputes.updateStage).toHaveBeenCalledWith(
        'dispute-1',
        'RESOLVED_NO_REFUND',
        expect.objectContaining({ resolutionNotes: 'no action needed' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor-1',
          action: 'DISPUTE_RESOLVED_NO_REFUND',
          entityId: 'dispute-1',
        }),
      );
    });
  });
});
