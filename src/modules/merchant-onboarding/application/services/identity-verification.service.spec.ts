import { ConfigService } from '@nestjs/config';
import { IdentityVerificationService } from './identity-verification.service';
import { encryptIdNumber } from '../../domain/id-number-crypto.util';
import {
  IdentityVerificationFailedException,
  OnboardingNotFoundException,
  OnboardingValidationException,
} from '../../domain/exceptions/onboarding.exceptions';

const TEST_KEY = 'a'.repeat(64);

function buildApp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'app-1',
    merchant: {
      taxId: '123456781',
      legalName: 'YN Restaurants Limited',
    },
    beneficialOwners: [
      {
        id: 'owner-1',
        fullName: 'Amina Hassan',
        idNumberEnc: encryptIdNumber('19850101123456781234', TEST_KEY),
      },
    ],
    ...overrides,
  };
}

function buildService(
  overrides: { app?: unknown; nidaResult?: unknown; traResult?: unknown } = {},
) {
  const onboarding = {
    findById: jest
      .fn()
      .mockResolvedValue('app' in overrides ? overrides.app : buildApp()),
    recordNidaVerification: jest
      .fn()
      .mockResolvedValue({ id: 'nida-result-1' }),
    recordTraVerification: jest.fn().mockResolvedValue({ id: 'tra-result-1' }),
    markStepComplete: jest.fn().mockResolvedValue(undefined),
  };
  const nida = {
    verify: jest.fn().mockResolvedValue(
      overrides.nidaResult ?? {
        result: 'MATCH',
        verifiedName: 'Amina Hassan',
      },
    ),
  };
  const tra = {
    verify: jest.fn().mockResolvedValue(
      overrides.traResult ?? {
        result: 'MATCH',
        verifiedName: 'YN Restaurants Limited',
      },
    ),
  };
  const config = {
    get: jest.fn().mockReturnValue(TEST_KEY),
  } as unknown as ConfigService;

  const service = new IdentityVerificationService(
    onboarding as never,
    nida,
    tra,
    config,
  );
  return { service, onboarding, nida, tra };
}

describe('IdentityVerificationService', () => {
  describe('verifyBeneficialOwnerNida', () => {
    it("decrypts the owner's ID, calls the provider, and marks the step complete on MATCH", async () => {
      const { service, onboarding, nida } = buildService();

      const result = await service.verifyBeneficialOwnerNida(
        'app-1',
        'owner-1',
        'actor-1',
      );

      expect(nida.verify).toHaveBeenCalledWith({
        nationalId: '19850101123456781234',
        expectedFullName: 'Amina Hassan',
      });
      expect(onboarding.recordNidaVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: 'app-1',
          beneficialOwnerId: 'owner-1',
          result: 'MATCH',
          verifiedBy: 'actor-1',
        }),
      );
      expect(onboarding.markStepComplete).toHaveBeenCalledWith(
        'app-1',
        'NIDA_VERIFICATION',
      );
      expect(result).toEqual({ id: 'nida-result-1' });
    });

    it('persists the failed attempt and throws an actionable exception on MISMATCH, without marking the step complete', async () => {
      const { service, onboarding } = buildService({
        nidaResult: {
          result: 'MISMATCH',
          reason: 'Name does not match NIDA records',
        },
      });

      await expect(
        service.verifyBeneficialOwnerNida('app-1', 'owner-1', 'actor-1'),
      ).rejects.toBeInstanceOf(IdentityVerificationFailedException);

      expect(onboarding.recordNidaVerification).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'MISMATCH' }),
      );
      expect(onboarding.markStepComplete).not.toHaveBeenCalled();
    });

    it('throws OnboardingNotFoundException for a missing application', async () => {
      const { service } = buildService({ app: null });
      await expect(
        service.verifyBeneficialOwnerNida('app-1', 'owner-1', 'actor-1'),
      ).rejects.toBeInstanceOf(OnboardingNotFoundException);
    });

    it('throws a validation error for a beneficial owner not on this application', async () => {
      const { service } = buildService();
      await expect(
        service.verifyBeneficialOwnerNida(
          'app-1',
          'owner-does-not-exist',
          'actor-1',
        ),
      ).rejects.toBeInstanceOf(OnboardingValidationException);
    });
  });

  describe('verifyTin', () => {
    it("calls the provider with the merchant's taxId/legalName and marks the step complete on MATCH", async () => {
      const { service, onboarding, tra } = buildService();

      const result = await service.verifyTin('app-1', 'actor-1');

      expect(tra.verify).toHaveBeenCalledWith({
        tin: '123456781',
        expectedLegalName: 'YN Restaurants Limited',
      });
      expect(onboarding.markStepComplete).toHaveBeenCalledWith(
        'app-1',
        'TRA_VERIFICATION',
      );
      expect(result).toEqual({ id: 'tra-result-1' });
    });

    it('throws OnboardingValidationException when no taxId is set, without calling the provider', async () => {
      const { service, tra } = buildService({
        app: buildApp({
          merchant: { taxId: null, legalName: 'YN Restaurants Limited' },
        }),
      });

      await expect(
        service.verifyTin('app-1', 'actor-1'),
      ).rejects.toBeInstanceOf(OnboardingValidationException);
      expect(tra.verify).not.toHaveBeenCalled();
    });

    it('throws an actionable exception on PROVIDER_ERROR, without marking the step complete', async () => {
      const { service, onboarding } = buildService({
        traResult: {
          result: 'PROVIDER_ERROR',
          reason: 'TRA registry unreachable',
        },
      });

      await expect(
        service.verifyTin('app-1', 'actor-1'),
      ).rejects.toBeInstanceOf(IdentityVerificationFailedException);
      expect(onboarding.markStepComplete).not.toHaveBeenCalled();
    });
  });
});
