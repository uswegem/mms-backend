import { OnboardingAppWithRelations } from '../../infrastructure/persistence/onboarding.repository';

export function toOnboardingResponse(app: OnboardingAppWithRelations) {
  const m = app.merchant;
  return {
    id: app.id,
    applicationNo: app.applicationNo,
    acquirerId: app.acquirerId,
    merchantId: app.merchantId,
    legalEntityType: app.legalEntityType,
    companyRegistrationNo: app.companyRegistrationNo,
    status: app.status,
    submittedAt: app.submittedAt?.toISOString() ?? null,
    approvedAt: app.approvedAt?.toISOString() ?? null,
    rejectedAt: app.rejectedAt?.toISOString() ?? null,
    rejectionCode: app.rejectionCode,
    rejectionNotes: app.rejectionNotes,
    makerId: app.makerId,
    checkerId: app.checkerId,
    merchant: {
      id: m.id,
      legalName: m.legalName,
      tradingName: m.tradingName,
      status: m.status,
      mcc: m.mcc,
      taxId: m.taxId,
      isSchool: m.isSchool,
      profile: m.profile
        ? {
            addressLine1: m.profile.addressLine1,
            addressLine2: m.profile.addressLine2,
            city: m.profile.city,
            postalCode: m.profile.postalCode,
            countryCode: m.profile.countryCode,
            contactPhone: m.profile.contactPhone,
            contactEmail: m.profile.contactEmail,
          }
        : null,
      settlementAccount: m.settlementAccounts.find((a) => a.isPrimary && !a.deletedAt)
        ? {
            id: m.settlementAccounts.find((a) => a.isPrimary && !a.deletedAt)!.id,
            accountNumber: m.settlementAccounts.find((a) => a.isPrimary && !a.deletedAt)!
              .accountNumber,
            accountName: m.settlementAccounts.find((a) => a.isPrimary && !a.deletedAt)!
              .accountName,
            bankCode: m.settlementAccounts.find((a) => a.isPrimary && !a.deletedAt)!.bankCode,
            verifiedAt:
              m.settlementAccounts
                .find((a) => a.isPrimary && !a.deletedAt)!
                .verifiedAt?.toISOString() ?? null,
          }
        : null,
    },
    steps: app.steps.map((s) => ({
      stepCode: s.stepCode,
      completedAt: s.completedAt?.toISOString() ?? null,
    })),
    beneficialOwners: app.beneficialOwners.map((o) => ({
      id: o.id,
      fullName: o.fullName,
      ownershipPct: o.ownershipPct?.toString() ?? null,
    })),
    amlResult: app.amlResults[0]
      ? {
          result: app.amlResults[0].result,
          screenedAt: app.amlResults[0].screenedAt.toISOString(),
        }
      : null,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  };
}
