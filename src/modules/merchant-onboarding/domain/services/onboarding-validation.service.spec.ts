import { DocumentType, LegalEntityType } from '@prisma/client';
import { OnboardingValidationException } from '../exceptions/onboarding.exceptions';
import { OnboardingValidationService } from './onboarding-validation.service';

describe('OnboardingValidationService', () => {
  const baseCtx = {
    legalEntityType: LegalEntityType.SOLE_PROPRIETOR,
    isSchool: false,
    docTypes: [DocumentType.KYC_ID],
    beneficialOwnerCount: 0,
    hasPrimarySettlement: true,
    amlPassed: true,
    profileComplete: true,
    contactEmail: 'test@example.com',
    contactPhone: '+255700000000',
  };

  it('requires settlement account before submit', () => {
    expect(() =>
      OnboardingValidationService.assertCanSubmit({
        ...baseCtx,
        hasPrimarySettlement: false,
      }),
    ).toThrow(OnboardingValidationException);
  });

  it('requires school registration number for schools', () => {
    expect(() =>
      OnboardingValidationService.assertCanSubmit({
        ...baseCtx,
        isSchool: true,
        docTypes: [DocumentType.KYC_ID, DocumentType.KYC_LICENSE, DocumentType.KYC_TIN],
        schoolRegistrationNo: null,
      }),
    ).toThrow(OnboardingValidationException);
  });

  it('allows valid merchant submit', () => {
    expect(() => OnboardingValidationService.assertCanSubmit(baseCtx)).not.toThrow();
  });
});
