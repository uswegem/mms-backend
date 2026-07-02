import { DocumentType, LegalEntityType } from '@prisma/client';
import { OnboardingValidationException } from '../exceptions/onboarding.exceptions';

export interface ValidationContext {
  legalEntityType: LegalEntityType;
  isSchool: boolean;
  docTypes: DocumentType[];
  beneficialOwnerCount: number;
  hasPrimarySettlement: boolean;
  amlPassed: boolean;
  profileComplete: boolean;
  schoolRegistrationNo?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export class OnboardingValidationService {
  static assertCanSubmit(ctx: ValidationContext): void {
    if (!ctx.profileComplete) {
      throw new OnboardingValidationException(
        'Profile is incomplete (legal name, trading name, city, postal code, MCC required)',
      );
    }

    if (!ctx.contactEmail?.trim() || !ctx.contactPhone?.trim()) {
      throw new OnboardingValidationException(
        'Primary contact email and mobile are required before submission',
      );
    }

    const requiredDocs = this.requiredDocTypes(ctx.legalEntityType, ctx.isSchool);
    for (const docType of requiredDocs) {
      if (!ctx.docTypes.includes(docType)) {
        throw new OnboardingValidationException(
          `Required document missing: ${docType}`,
        );
      }
    }

    if (ctx.legalEntityType === LegalEntityType.COMPANY && !ctx.isSchool) {
      if (ctx.beneficialOwnerCount < 1) {
        throw new OnboardingValidationException(
          'At least one beneficial owner is required for company registration',
        );
      }
    }

    if (ctx.isSchool && !ctx.schoolRegistrationNo?.trim()) {
      throw new OnboardingValidationException(
        'School registration number is required before submission',
      );
    }

    if (!ctx.hasPrimarySettlement) {
      throw new OnboardingValidationException(
        'Primary settlement account must be assigned before submission',
      );
    }

    if (!ctx.amlPassed) {
      throw new OnboardingValidationException(
        'AML screening must pass before submission',
      );
    }
  }

  static requiredDocTypes(
    legalEntityType: LegalEntityType,
    isSchool = false,
  ): DocumentType[] {
    if (isSchool) {
      return [DocumentType.KYC_ID, DocumentType.KYC_LICENSE, DocumentType.KYC_TIN];
    }
    if (legalEntityType === LegalEntityType.COMPANY) {
      return [DocumentType.KYC_ID, DocumentType.KYC_LICENSE, DocumentType.KYC_TIN];
    }
    return [DocumentType.KYC_ID];
  }
}
