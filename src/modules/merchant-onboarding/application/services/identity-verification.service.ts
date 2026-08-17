import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnboardingRepository } from '../../infrastructure/persistence/onboarding.repository';
import { NidaVerificationProvider } from '../ports/nida-verification.port';
import { TraVerificationProvider } from '../ports/tra-verification.port';
import {
  decryptIdNumber,
  resolveIdNumberKey,
} from '../../domain/id-number-crypto.util';
import { ONBOARDING_STEPS } from '../../domain/constants/onboarding-steps';
import {
  IdentityVerificationFailedException,
  OnboardingNotFoundException,
  OnboardingValidationException,
} from '../../domain/exceptions/onboarding.exceptions';

/**
 * Brief §4.3: NIDA verification (Step 2) and TRA TIN verification (Step 3).
 * Deliberately NOT wired into OnboardingStatusMachine — unlike bank
 * validation/TPS registration (durable async pipeline stages with their
 * own PENDING_X/X_FAILED statuses), these are synchronous point-checks the
 * applicant can retry immediately after fixing a typo, tracked via the
 * existing freeform OnboardingStep mechanism instead of new status states
 * that would need threading through the whole transition graph.
 */
@Injectable()
export class IdentityVerificationService {
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly nida: NidaVerificationProvider,
    private readonly tra: TraVerificationProvider,
    private readonly config: ConfigService,
  ) {}

  async verifyBeneficialOwnerNida(
    applicationId: string,
    beneficialOwnerId: string,
    actorId: string,
  ) {
    const app = await this.onboarding.findById(applicationId);
    if (!app) throw new OnboardingNotFoundException(applicationId);

    const owner = app.beneficialOwners.find((o) => o.id === beneficialOwnerId);
    if (!owner) {
      throw new OnboardingValidationException(
        `Beneficial owner ${beneficialOwnerId} not found on this application`,
      );
    }

    const key = resolveIdNumberKey(this.config);
    const nationalId = decryptIdNumber(Buffer.from(owner.idNumberEnc), key);

    const outcome = await this.nida.verify({
      nationalId,
      expectedFullName: owner.fullName,
    });

    const record = await this.onboarding.recordNidaVerification({
      applicationId,
      beneficialOwnerId,
      result: outcome.result,
      verifiedName: outcome.verifiedName,
      failureReason: outcome.reason,
      rawResponse: outcome.rawResponse as never,
      verifiedBy: actorId,
    });

    if (outcome.result !== 'MATCH') {
      throw new IdentityVerificationFailedException(
        'NIDA',
        outcome.result,
        outcome.reason ?? 'NIDA verification failed',
      );
    }

    await this.onboarding.markStepComplete(
      applicationId,
      ONBOARDING_STEPS.NIDA_VERIFICATION,
    );
    return record;
  }

  async verifyTin(applicationId: string, actorId: string) {
    const app = await this.onboarding.findById(applicationId);
    if (!app) throw new OnboardingNotFoundException(applicationId);

    if (!app.merchant.taxId) {
      throw new OnboardingValidationException(
        'No TIN is set on this application — capture it in the entity profile step before verifying with TRA',
      );
    }

    const outcome = await this.tra.verify({
      tin: app.merchant.taxId,
      expectedLegalName: app.merchant.legalName,
    });

    const record = await this.onboarding.recordTraVerification({
      applicationId,
      tin: app.merchant.taxId,
      result: outcome.result,
      verifiedName: outcome.verifiedName,
      failureReason: outcome.reason,
      rawResponse: outcome.rawResponse as never,
      verifiedBy: actorId,
    });

    if (outcome.result !== 'MATCH') {
      throw new IdentityVerificationFailedException(
        'TRA',
        outcome.result,
        outcome.reason ?? 'TRA verification failed',
      );
    }

    await this.onboarding.markStepComplete(
      applicationId,
      ONBOARDING_STEPS.TRA_VERIFICATION,
    );
    return record;
  }
}
