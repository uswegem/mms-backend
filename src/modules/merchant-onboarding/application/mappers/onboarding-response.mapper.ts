import { OnboardingAppWithRelations } from '../../infrastructure/persistence/onboarding.repository';

export function toOnboardingResponse(app: OnboardingAppWithRelations) {
  const m = app.merchant;
  const primary = m.settlementAccounts.find((a) => a.isPrimary && !a.deletedAt);
  return {
    id: app.id,
    applicationNo: app.applicationNo,
    acquirerId: app.acquirerId,
    merchantId: app.merchantId,
    legalEntityType: app.legalEntityType,
    companyRegistrationNo: app.companyRegistrationNo,
    status: app.status,
    currentStep: app.currentStep,
    submittedAt: app.submittedAt?.toISOString() ?? null,
    approvedAt: app.approvedAt?.toISOString() ?? null,
    activatedAt: app.activatedAt?.toISOString() ?? null,
    rejectedAt: app.rejectedAt?.toISOString() ?? null,
    rejectionCode: app.rejectionCode,
    rejectionNotes: app.rejectionNotes,
    makerId: app.makerId,
    checkerId: app.checkerId,
    merchant: {
      id: m.id,
      merchantCode: m.merchantCode,
      legalName: m.legalName,
      tradingName: m.tradingName,
      displayName: m.displayName,
      status: m.status,
      mcc: m.mcc,
      businessCategory: m.businessCategory,
      taxId: m.taxId,
      vrn: m.vrn,
      licenseNumber: m.licenseNumber,
      contactPerson: m.contactPerson,
      relationshipManager: m.relationshipManager,
      branch: m.branch,
      sourceChannel: m.sourceChannel,
      isSchool: m.isSchool,
      profile: m.profile
        ? {
            addressLine1: m.profile.addressLine1,
            addressLine2: m.profile.addressLine2,
            region: m.profile.region,
            district: m.profile.district,
            ward: m.profile.ward,
            city: m.profile.city,
            postalCode: m.profile.postalCode,
            countryCode: m.profile.countryCode,
            contactPhone: m.profile.contactPhone,
            contactEmail: m.profile.contactEmail,
          }
        : null,
      settlementAccount: primary
        ? {
            id: primary.id,
            accountNumber: primary.accountNumber,
            accountName: primary.accountName,
            bankCode: primary.bankCode,
            verifiedAt: primary.verifiedAt?.toISOString() ?? null,
          }
        : null,
      documents: m.documents?.map((d) => ({
        id: d.id,
        docType: d.docType,
        fileName: d.fileName,
        verificationStatus: d.verificationStatus,
        rejectionReason: d.rejectionReason,
        createdAt: d.createdAt.toISOString(),
      })) ?? [],
      alias: m.merchantAlias
        ? { alias8digit: m.merchantAlias.alias8digit }
        : null,
      stores: m.stores?.map((s) => ({
        id: s.id,
        storeName: s.storeName,
        storeCode: s.storeCode,
        terminalId: s.terminalId,
        alias: s.alias,
        lipaNambaHandle: s.upiHandle,
        qrString: s.qrString,
        status: s.status,
      })) ?? [],
      settlementConfig: m.settlementConfig
        ? {
            settlementAlias: m.settlementConfig.settlementAlias,
            payoutCycle: m.settlementConfig.payoutCycle,
            mdr: m.settlementConfig.mdr?.toString() ?? null,
            charges: m.settlementConfig.charges?.toString() ?? null,
            transactionLimit: m.settlementConfig.transactionLimit?.toString() ?? null,
            dailyLimit: m.settlementConfig.dailyLimit?.toString() ?? null,
            approvalStatus: m.settlementConfig.approvalStatus,
            remarks: m.settlementConfig.remarks,
          }
        : null,
      integrations: m.integrations?.map((i) => ({
        integrationType: i.integrationType,
        externalReferenceId: i.externalReferenceId,
        status: i.status,
        failureReason: i.failureReason,
        retryCount: i.retryCount,
        lastTriedAt: i.lastTriedAt?.toISOString() ?? null,
      })) ?? [],
    },
    riskReview: app.riskReviews[0]
      ? {
          riskScore: app.riskReviews[0].riskScore,
          riskLevel: app.riskReviews[0].riskLevel,
          duplicateFlag: app.riskReviews[0].duplicateFlag,
          blacklistFlag: app.riskReviews[0].blacklistFlag,
          status: app.riskReviews[0].status,
          remarks: app.riskReviews[0].remarks,
        }
      : null,
    steps: app.steps.map((s) => ({
      stepCode: s.stepCode,
      completedAt: s.completedAt?.toISOString() ?? null,
    })),
    beneficialOwners: app.beneficialOwners.map((o) => ({
      id: o.id,
      fullName: o.fullName,
      ownershipPct: o.ownershipPct?.toString() ?? null,
      nidaVerifications: o.nidaVerifications.map((v) => ({
        id: v.id,
        result: v.result,
        verifiedName: v.verifiedName,
        failureReason: v.failureReason,
        verifiedAt: v.verifiedAt.toISOString(),
      })),
    })),
    traVerifications: app.traVerifications.map((v) => ({
      id: v.id,
      tin: v.tin,
      result: v.result,
      verifiedName: v.verifiedName,
      failureReason: v.failureReason,
      verifiedAt: v.verifiedAt.toISOString(),
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
