import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KycUpgradeService } from './kyc-upgrade.service';

function buildMerchant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'merchant-1',
    legalName: 'Dada Fashion TZ',
    kycTier: 'TIER_1',
    ...overrides,
  };
}

function buildRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'req-1',
    acquirerId: 'acquirer-1',
    merchantId: 'merchant-1',
    fromTier: 'TIER_1',
    toTier: 'TIER_2',
    status: 'IN_PROGRESS',
    tinVerificationResult: null,
    documents: [],
    ...overrides,
  };
}

function buildService() {
  const requests = {
    create: jest.fn(),
    findById: jest.fn(),
    findActiveForMerchant: jest.fn().mockResolvedValue(null),
    recordTinVerification: jest.fn(),
    addDocument: jest.fn(),
    updateStatus: jest.fn(),
  };
  const prisma = {
    merchant: { findUnique: jest.fn(), update: jest.fn() },
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
  };
  const makerChecker = { createTask: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const tra = { verify: jest.fn() };
  const limits = {
    getPolicy: jest
      .fn()
      .mockResolvedValue({ monthlyLimit: new Prisma.Decimal(4_000_000) }),
  };
  const service = new KycUpgradeService(
    requests as never,
    prisma as never,
    makerChecker as never,
    audit as never,
    tra,
    limits as never,
  );
  return { service, requests, prisma, makerChecker, audit, tra, limits };
}

describe('KycUpgradeService', () => {
  describe('getStatus', () => {
    it('flags a TIER_1 merchant whose rolling volume breaches the tier threshold', async () => {
      const { service, prisma } = buildService();
      prisma.merchant.findUnique.mockResolvedValue(buildMerchant());
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(4_180_000) },
      });

      const status = await service.getStatus('merchant-1');

      expect(status.breached).toBe(true);
      expect(status.rollingVolume).toBe(4_180_000);
      expect(status.tierThreshold).toBe(4_000_000);
    });

    it('never flags a merchant already above TIER_1', async () => {
      const { service, prisma } = buildService();
      prisma.merchant.findUnique.mockResolvedValue(
        buildMerchant({ kycTier: 'TIER_2' }),
      );
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(50_000_000) },
      });

      const status = await service.getStatus('merchant-1');

      expect(status.breached).toBe(false);
    });
  });

  describe('startUpgrade', () => {
    it('rejects a merchant with no defined upgrade path', async () => {
      const { service, prisma } = buildService();
      prisma.merchant.findUnique.mockResolvedValue(
        buildMerchant({ kycTier: 'TIER_2' }),
      );

      await expect(
        service.startUpgrade('acquirer-1', 'merchant-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a second request while one is already active', async () => {
      const { service, prisma, requests } = buildService();
      prisma.merchant.findUnique.mockResolvedValue(buildMerchant());
      requests.findActiveForMerchant.mockResolvedValue(buildRequest());

      await expect(
        service.startUpgrade('acquirer-1', 'merchant-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a TIER_1 -> TIER_2 request and audits it', async () => {
      const { service, prisma, requests, audit } = buildService();
      prisma.merchant.findUnique.mockResolvedValue(buildMerchant());
      requests.create.mockResolvedValue(buildRequest());

      const result = await service.startUpgrade(
        'acquirer-1',
        'merchant-1',
        'actor-1',
      );

      expect(requests.create).toHaveBeenCalledWith(
        expect.objectContaining({ fromTier: 'TIER_1', toTier: 'TIER_2' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_UPGRADE_STARTED' }),
      );
      expect(result.id).toBe('req-1');
    });
  });

  describe('verifyTin', () => {
    it('rejects a MISMATCH result and records it', async () => {
      const { service, requests, prisma, tra, audit } = buildService();
      requests.findById.mockResolvedValue(buildRequest());
      prisma.merchant.findUnique.mockResolvedValue(buildMerchant());
      tra.verify.mockResolvedValue({
        result: 'MISMATCH',
        reason: 'Name mismatch',
      });

      await expect(
        service.verifyTin('req-1', 'actor-1', '123456789'),
      ).rejects.toThrow(BadRequestException);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'KYC_UPGRADE_TIN_VERIFICATION_FAILED',
        }),
      );
    });

    it('records a MATCH result', async () => {
      const { service, requests, prisma, tra, audit } = buildService();
      requests.findById.mockResolvedValue(buildRequest());
      prisma.merchant.findUnique.mockResolvedValue(buildMerchant());
      tra.verify.mockResolvedValue({
        result: 'MATCH',
        verifiedName: 'Dada Fashion TZ',
      });
      requests.recordTinVerification.mockResolvedValue(
        buildRequest({ tinVerificationResult: 'MATCH' }),
      );

      const result = await service.verifyTin('req-1', 'actor-1', '123456789');

      expect(result.tinVerificationResult).toBe('MATCH');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_UPGRADE_TIN_VERIFIED' }),
      );
    });
  });

  describe('submitForApproval', () => {
    it('rejects submitting without a verified TIN', async () => {
      const { service, requests } = buildService();
      requests.findById.mockResolvedValue(buildRequest());

      await expect(
        service.submitForApproval('req-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects submitting without documents', async () => {
      const { service, requests } = buildService();
      requests.findById.mockResolvedValue(
        buildRequest({ tinVerificationResult: 'MATCH' }),
      );

      await expect(
        service.submitForApproval('req-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a real KYC_TIER_UPGRADE approval task and moves to PENDING_CHECKER_APPROVAL', async () => {
      const { service, requests, makerChecker, audit } = buildService();
      requests.findById.mockResolvedValue(
        buildRequest({
          tinVerificationResult: 'MATCH',
          documents: [{ id: 'doc-1' }],
        }),
      );
      requests.updateStatus.mockResolvedValue(
        buildRequest({ status: 'PENDING_CHECKER_APPROVAL' }),
      );

      await service.submitForApproval('req-1', 'actor-1');

      expect(makerChecker.createTask).toHaveBeenCalledWith(
        'acquirer-1',
        'KYC_TIER_UPGRADE',
        'req-1',
        'actor-1',
      );
      expect(requests.updateStatus).toHaveBeenCalledWith(
        'req-1',
        'PENDING_CHECKER_APPROVAL',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_UPGRADE_SUBMITTED' }),
      );
    });
  });

  describe('onCheckerApproved / onCheckerRejected', () => {
    it('bumps the merchant kycTier and marks the request APPROVED', async () => {
      const { service, requests, prisma, audit } = buildService();
      requests.findById.mockResolvedValue(buildRequest());

      await service.onCheckerApproved('req-1', 'checker-1');

      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'merchant-1' },
        data: { kycTier: 'TIER_2' },
      });
      expect(requests.updateStatus).toHaveBeenCalledWith(
        'req-1',
        'APPROVED',
        expect.objectContaining({ decidedAt: expect.any(Date) as Date }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'checker-1',
          action: 'KYC_UPGRADE_APPROVED',
        }),
      );
    });

    it('marks the request REJECTED without touching the merchant tier', async () => {
      const { service, requests, prisma, audit } = buildService();

      await service.onCheckerRejected(
        'req-1',
        'checker-1',
        'insufficient docs',
      );

      expect(prisma.merchant.update).not.toHaveBeenCalled();
      expect(requests.updateStatus).toHaveBeenCalledWith(
        'req-1',
        'REJECTED',
        expect.objectContaining({ rejectionNotes: 'insufficient docs' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'checker-1',
          action: 'KYC_UPGRADE_REJECTED',
        }),
      );
    });
  });
});
