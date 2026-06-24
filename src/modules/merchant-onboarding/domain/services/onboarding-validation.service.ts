import { DocumentType, LegalEntityType } from '@prisma/client';
import { OnboardingValidationException } from '../exceptions/onboarding.exceptions';

export interface ValidationContext {
  legalEntityType: LegalEntityType;
  isSchool: boolean;
  docTypes: DocumentType[];
  beneficialOwnerCount: number;
  hasPrimarySettlement: boolean;
  cbsVerified: boolean;
  amlPassed: boolean;
  profileComplete: boolean;
}

export class OnboardingValidationService {
  static assertCanSubmit(ctx: ValidationContext): void {
    if (!ctx.profileComplete) {
      throw new OnboardingValidationException(
        'Merchant profile is incomplete (legal name, trading name, city, postal code, MCC required)',
      );
    }

    if (!ctx.docTypes.includes(DocumentType.KYC_ID)) {
      throw new OnboardingValidationException(
        'National ID or passport document (KYC_ID) is required',
      );
    }

    if (ctx.legalEntityType === LegalEntityType.COMPANY) {
      if (!ctx.docTypes.includes(DocumentType.KYC_LICENSE)) {
        throw new OnboardingValidationException(
          'Business license (KYC_LICENSE) is required for company registration',
        );
      }
      if (!ctx.docTypes.includes(DocumentType.KYC_TIN)) {
        throw new OnboardingValidationException(
          'TIN certificate (KYC_TIN) is required for company registration',
        );
      }
      if (ctx.beneficialOwnerCount < 1) {
        throw new OnboardingValidationException(
          'At least one beneficial owner is required for company registration',
        );
      }
    }

    if (!ctx.hasPrimarySettlement) {
      throw new OnboardingValidationException(
        'Primary settlement account must be assigned before submission',
      );
    }

    if (!ctx.cbsVerified) {
      throw new OnboardingValidationException(
        'Settlement account must pass CBS verification before submission',
      );
    }

    if (!ctx.amlPassed) {
      throw new OnboardingValidationException(
        'AML screening must pass before submission',
      );
    }
  }

  static requiredDocTypes(legalEntityType: LegalEntityType): DocumentType[] {
    if (legalEntityType === LegalEntityType.COMPANY) {
      return [DocumentType.KYC_ID, DocumentType.KYC_LICENSE, DocumentType.KYC_TIN];
    }
    return [DocumentType.KYC_ID];
  }
}
