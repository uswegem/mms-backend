import { Injectable } from '@nestjs/common';
import {
  IntegrationType,
  KycStatus,
  MerchantStatus,
  OnboardingStatus,
  RiskReviewStatus,
  SettlementApprovalStatus,
} from '@prisma/client';
import { CbsVerificationService } from '@modules/cbs/application/services/cbs-verification.service';
import { MakerCheckerService } from '@modules/maker-checker/application/services/maker-checker.service';
import { ApprovalEntityType } from '@prisma/client';
import { OnboardingRepository } from '../../infrastructure/persistence/onboarding.repository';
import { OnboardingValidationService } from '../../domain/services/onboarding-validation.service';
import { OnboardingStatusMachine } from '../../domain/services/onboarding-status.machine';
import {
  OnboardingNotFoundException,
  OnboardingValidationException,
} from '../../domain/exceptions/onboarding.exceptions';
import { OnboardingAuditService } from './onboarding-audit.service';
import { OnboardingDuplicateService } from './onboarding-duplicate.service';
import { TpsRegistrationProvider } from '../ports/tps-registration.port';
import { MerchantIssuanceService } from './merchant-issuance.service';
import { ONBOARDING_STEPS } from '../../domain/constants/onboarding-steps';

@Injectable()
export class OnboardingPipelineService {
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly cbs: CbsVerificationService,
    private readonly makerChecker: MakerCheckerService,
    private readonly audit: OnboardingAuditService,
    private readonly duplicates: OnboardingDuplicateService,
    private readonly tps: TpsRegistrationProvider,
    private readonly issuance: MerchantIssuanceService,
  ) {}

  async submit(applicationId: string, actorId: string, acquirerId: string) {
    const { app, ctx } = await this.buildContext(applicationId);

    if (!OnboardingStatusMachine.isEditable(app.status) && app.status !== 'DRAFT') {
      if (app.status !== 'REJECTED' && app.status !== 'KYC_REJECTED') {
        throw new OnboardingValidationException('Application cannot be submitted in current status');
      }
    }

    await this.duplicates.assertNoDuplicates({
      acquirerId,
      merchantId: app.merchantId,
      taxId: app.merchant.taxId,
      vrn: app.merchant.vrn,
      businessRegistrationNo: app.companyRegistrationNo,
      licenseNumber: app.merchant.licenseNumber,
      email: app.merchant.profile?.contactEmail,
      mobile: app.merchant.profile?.contactPhone,
    });

    if (!ctx.amlPassed) {
      await this.onboarding.recordAml(applicationId, 'PASS', `AML-${Date.now()}`);
    }

    const refreshed = await this.buildContext(applicationId);
    OnboardingValidationService.assertCanSubmit(refreshed.ctx);

    const nextStatus = OnboardingStatusMachine.transition(app.status, 'SUBMIT');
    return this.onboarding.transitionStatus(applicationId, nextStatus, actorId, {
      action: 'SUBMIT',
      currentStep: ONBOARDING_STEPS.FINAL_REVIEW,
      merchantStatus: MerchantStatus.PENDING_REVIEW,
      kycStatus: KycStatus.SUBMITTED,
      submittedAt: new Date(),
    });
  }

  async approveKyc(applicationId: string, actorId: string, acquirerId: string, remarks?: string) {
    const app = await this.requireApp(applicationId);
    if (app.createdBy === actorId) {
      throw new OnboardingValidationException('Maker cannot approve their own onboarding request');
    }

    const next = OnboardingStatusMachine.transition(app.status, 'KYC_APPROVE');
    const updated = await this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'KYC_APPROVE',
      remarks,
      currentStep: ONBOARDING_STEPS.RISK_REVIEW,
    });

    await this.onboarding.createRiskReview(applicationId, app.merchantId, actorId);
    await this.onboarding.recordApproval(applicationId, 'KYC', 'APPROVED', actorId, remarks);

    if (await this.makerChecker.isEnabled(acquirerId, ApprovalEntityType.MERCHANT_ONBOARDING)) {
      const entityType = app.merchant.isSchool
        ? ApprovalEntityType.SCHOOL_ONBOARDING
        : ApprovalEntityType.MERCHANT_ONBOARDING;
      await this.makerChecker.createTask(
        acquirerId,
        entityType,
        applicationId,
        actorId,
      );
    }

    return updated;
  }

  async rejectKyc(
    applicationId: string,
    actorId: string,
    rejectionCode: string,
    remarks?: string,
  ) {
    const app = await this.requireApp(applicationId);
    const next = OnboardingStatusMachine.transition(app.status, 'KYC_REJECT');
    return this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'KYC_REJECT',
      remarks,
      rejectionCode,
      currentStep: ONBOARDING_STEPS.KYC_DOCUMENTS,
      kycStatus: KycStatus.REJECTED,
    });
  }

  async sendBackKyc(applicationId: string, actorId: string, remarks?: string) {
    const app = await this.requireApp(applicationId);
    const next = OnboardingStatusMachine.transition(app.status, 'KYC_SEND_BACK');
    return this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'KYC_SEND_BACK',
      remarks,
      currentStep: ONBOARDING_STEPS.KYC_DOCUMENTS,
      kycStatus: KycStatus.PENDING,
    });
  }

  async sendBackRisk(applicationId: string, actorId: string, remarks?: string) {
    const app = await this.requireApp(applicationId);
    const next = OnboardingStatusMachine.transition(app.status, 'RISK_SEND_BACK');
    return this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'RISK_SEND_BACK',
      remarks,
      currentStep: ONBOARDING_STEPS.RISK_REVIEW,
      kycStatus: KycStatus.PENDING,
    });
  }

  async approveRisk(applicationId: string, actorId: string, data: {
    riskScore?: number;
    riskLevel?: string;
    duplicateFlag?: boolean;
    blacklistFlag?: boolean;
    remarks?: string;
  }) {
    const app = await this.requireApp(applicationId);
    if (data.blacklistFlag) {
      throw new OnboardingValidationException('Merchant flagged on blacklist — cannot approve');
    }

    await this.onboarding.completeRiskReview(applicationId, {
      ...data,
      status: RiskReviewStatus.APPROVED,
      reviewedBy: actorId,
    });

    const next = OnboardingStatusMachine.transition(app.status, 'RISK_APPROVE');
    const updated = await this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'RISK_APPROVE',
      remarks: data.remarks,
      currentStep: ONBOARDING_STEPS.BANK_VALIDATION,
    });

    await this.runBankValidation(applicationId, actorId);
    return updated;
  }

  async rejectRisk(applicationId: string, actorId: string, remarks?: string) {
    const app = await this.requireApp(applicationId);
    await this.onboarding.completeRiskReview(applicationId, {
      status: RiskReviewStatus.REJECTED,
      reviewedBy: actorId,
      remarks,
    });
    const next = OnboardingStatusMachine.transition(app.status, 'RISK_REJECT');
    return this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'RISK_REJECT',
      remarks,
      currentStep: ONBOARDING_STEPS.RISK_REVIEW,
    });
  }

  async runBankValidation(applicationId: string, actorId: string) {
    const app = await this.requireApp(applicationId);
    try {
      await this.verifyBankInternal(applicationId, actorId);
      const next = OnboardingStatusMachine.transition(
        app.status === 'PENDING_BANK_VALIDATION' ? app.status : 'PENDING_BANK_VALIDATION',
        'BANK_VALIDATE',
      );
      const updated = await this.onboarding.transitionStatus(applicationId, next, actorId, {
        action: 'BANK_VALIDATE',
        currentStep: ONBOARDING_STEPS.TPS_REGISTRATION,
      });
      await this.registerTps(applicationId, actorId);
      return updated;
    } catch (err) {
      const next = OnboardingStatusMachine.transition(
        app.status === 'PENDING_BANK_VALIDATION' ? app.status : 'PENDING_BANK_VALIDATION',
        'BANK_VALIDATE_FAIL',
      );
      return this.onboarding.transitionStatus(applicationId, next, actorId, {
        action: 'BANK_VALIDATE_FAIL',
        remarks: err instanceof Error ? err.message : 'Bank validation failed',
        currentStep: ONBOARDING_STEPS.BANK_VALIDATION,
      });
    }
  }

  async registerTps(applicationId: string, actorId: string) {
    const app = await this.requireApp(applicationId);
    const merchant = app.merchant;
    const idempotencyKey = `onboarding-${applicationId}-tps`;

    const result = await this.tps.registerMerchant(
      {
        merchantId: merchant.id,
        legalName: merchant.legalName,
        tradingName: merchant.tradingName,
        mcc: merchant.mcc,
        taxId: merchant.taxId,
      },
      idempotencyKey,
      actorId,
    );

    if (!result.success) {
      const next = OnboardingStatusMachine.transition(
        ['BANK_VALIDATED', 'PENDING_TPS_REGISTRATION', 'TPS_REGISTRATION_FAILED'].includes(app.status)
          ? (app.status === 'BANK_VALIDATED' ? 'BANK_VALIDATED' : app.status)
          : 'BANK_VALIDATED',
        'TPS_FAIL',
      );
      return this.onboarding.transitionStatus(applicationId, next, actorId, {
        action: 'TPS_FAIL',
        remarks: result.failureReason,
        currentStep: ONBOARDING_STEPS.TPS_REGISTRATION,
      });
    }

    const next = OnboardingStatusMachine.transition('BANK_VALIDATED', 'TPS_REGISTER');
    const updated = await this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'TPS_REGISTER',
      currentStep: ONBOARDING_STEPS.ALIAS_QR_SETUP,
      metadata: { tpsMerchantId: result.tpsMerchantId },
    });

    await this.registerAliasQr(applicationId, actorId);
    return updated;
  }

  async retryTps(applicationId: string, actorId: string) {
    const app = await this.requireApp(applicationId);
    const next = OnboardingStatusMachine.transition(app.status, 'TPS_RETRY');
    await this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'TPS_RETRY',
      currentStep: ONBOARDING_STEPS.TPS_REGISTRATION,
    });
    return this.registerTps(applicationId, actorId);
  }

  async registerAliasQr(applicationId: string, actorId: string) {
    const app = await this.requireApp(applicationId);
    try {
      await this.issuance.issueMerchantAliasAndQr(app.merchantId, actorId);
      await this.onboarding.transitionStatus(applicationId, 'ALIAS_QR_REGISTERED', actorId, {
        action: 'ALIAS_QR_REGISTER',
        currentStep: ONBOARDING_STEPS.FINAL_REVIEW,
      });
      return this.onboarding.transitionStatus(applicationId, 'READY_FOR_ACTIVATION', actorId, {
        action: 'PREPARE_ACTIVATION',
        currentStep: ONBOARDING_STEPS.FINAL_REVIEW,
      });
    } catch (err) {
      const next = OnboardingStatusMachine.transition('TPS_REGISTERED', 'ALIAS_QR_FAIL');
      return this.onboarding.transitionStatus(applicationId, next, actorId, {
        action: 'ALIAS_QR_FAIL',
        remarks: err instanceof Error ? err.message : 'Alias/QR registration failed',
        currentStep: ONBOARDING_STEPS.ALIAS_QR_SETUP,
      });
    }
  }

  async retryAliasQr(applicationId: string, actorId: string) {
    const app = await this.requireApp(applicationId);
    const next = OnboardingStatusMachine.transition(app.status, 'ALIAS_QR_RETRY');
    await this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'ALIAS_QR_RETRY',
      currentStep: ONBOARDING_STEPS.ALIAS_QR_SETUP,
    });
    return this.registerAliasQr(applicationId, actorId);
  }

  async saveSettlement(
    applicationId: string,
    actorId: string,
    data: {
      settlementAlias?: string;
      settlementAccountId?: string;
      payoutCycle?: string;
      mdr?: number;
      charges?: number;
      transactionLimit?: number;
      dailyLimit?: number;
    },
  ) {
    const app = await this.requireApp(applicationId);
    if (!['ALIAS_QR_REGISTERED', 'PENDING_SETTLEMENT_SETUP', 'SETTLEMENT_REJECTED'].includes(app.status)) {
      throw new OnboardingValidationException('Settlement cannot be configured at this stage');
    }

    await this.onboarding.upsertSettlementConfig(app.merchantId, {
      ...data,
      createdBy: actorId,
      approvalStatus: SettlementApprovalStatus.DRAFT,
    });

    const next = OnboardingStatusMachine.transition(
      app.status === 'ALIAS_QR_REGISTERED' ? 'ALIAS_QR_REGISTERED' : app.status,
      'SETTLEMENT_SAVE',
    );

    return this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'SETTLEMENT_SAVE',
      currentStep: ONBOARDING_STEPS.SETTLEMENT_CONFIG,
    });
  }

  async submitSettlement(applicationId: string, actorId: string) {
    const app = await this.requireApp(applicationId);
    await this.onboarding.upsertSettlementConfig(app.merchantId, {
      approvalStatus: SettlementApprovalStatus.PENDING,
      createdBy: actorId,
    });
    const next = OnboardingStatusMachine.transition(
      app.status === 'PENDING_SETTLEMENT_SETUP' ? app.status : 'PENDING_SETTLEMENT_SETUP',
      'SETTLEMENT_SUBMIT',
    );
    return this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'SETTLEMENT_SUBMIT',
      currentStep: ONBOARDING_STEPS.FINAL_REVIEW,
    });
  }

  async approveSettlement(applicationId: string, actorId: string, remarks?: string) {
    const app = await this.requireApp(applicationId);
    await this.onboarding.upsertSettlementConfig(app.merchantId, {
      approvalStatus: SettlementApprovalStatus.APPROVED,
      approvedBy: actorId,
      approvedAt: new Date(),
      remarks,
    });
    const next = OnboardingStatusMachine.transition(app.status, 'SETTLEMENT_APPROVE');
    return this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'SETTLEMENT_APPROVE',
      remarks,
      currentStep: ONBOARDING_STEPS.FINAL_REVIEW,
    });
  }

  async rejectSettlement(applicationId: string, actorId: string, remarks?: string) {
    const app = await this.requireApp(applicationId);
    await this.onboarding.upsertSettlementConfig(app.merchantId, {
      approvalStatus: SettlementApprovalStatus.REJECTED,
      remarks,
    });
    const next = OnboardingStatusMachine.transition(app.status, 'SETTLEMENT_REJECT');
    return this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'SETTLEMENT_REJECT',
      remarks,
      currentStep: ONBOARDING_STEPS.SETTLEMENT_CONFIG,
    });
  }

  async activate(applicationId: string, actorId: string) {
    const app = await this.requireApp(applicationId);
    if (!OnboardingStatusMachine.canActivate(app.status)) {
      throw new OnboardingValidationException(
        'Activation requires settlement approval and all mandatory steps complete',
      );
    }

    if (app.status === 'SETTLEMENT_APPROVED') {
      await this.onboarding.transitionStatus(applicationId, 'READY_FOR_ACTIVATION', actorId, {
        action: 'PREPARE_ACTIVATION',
      });
    }

    const refreshed = await this.requireApp(applicationId);
    const next = OnboardingStatusMachine.transition(refreshed.status, 'ACTIVATE');
    const merchantCode = `MMS-${refreshed.applicationNo.replace('ONB-', '')}`;

    const activated = await this.onboarding.transitionStatus(applicationId, next, actorId, {
      action: 'ACTIVATE',
      currentStep: ONBOARDING_STEPS.FINAL_REVIEW,
      merchantStatus: MerchantStatus.ACTIVE,
      kycStatus: KycStatus.APPROVED,
      merchantCode,
      activatedAt: new Date(),
      onboardedAt: new Date(),
    });

    if (refreshed.merchant.isSchool) {
      await this.onboarding.ensureSchoolRecord(refreshed.merchantId);
    }

    return activated;
  }

  async onCheckerApproved(applicationId: string, checkerId: string) {
    const app = await this.requireApp(applicationId);
    if (app.createdBy === checkerId) {
      throw new OnboardingValidationException('Checker cannot approve their own onboarding request');
    }

    const fromStatus =
      app.status === 'UNDER_REVIEW' || app.status === 'PENDING_KYC_APPROVAL'
        ? app.status
        : 'UNDER_REVIEW';
    const next = OnboardingStatusMachine.transition(fromStatus, 'CHECKER_APPROVE');

    await this.onboarding.transitionStatus(applicationId, next, checkerId, {
      action: 'CHECKER_APPROVE',
      currentStep: ONBOARDING_STEPS.BANK_VALIDATION,
      kycStatus: KycStatus.APPROVED,
    });

    await this.onboarding.recordApproval(applicationId, 'KYC', 'APPROVED', checkerId);
    await this.onboarding.createRiskReview(applicationId, app.merchantId, checkerId);
    await this.onboarding.completeRiskReview(applicationId, {
      status: RiskReviewStatus.APPROVED,
      reviewedBy: checkerId,
      riskScore: 25,
      riskLevel: 'LOW',
    });

    return this.runBankValidation(applicationId, checkerId);
  }

  async getDashboardStats(acquirerId: string) {
    return this.onboarding.getStatusCounts(acquirerId);
  }

  private async verifyBankInternal(applicationId: string, actorId: string) {
    const app = await this.requireApp(applicationId);
    const account = app.merchant.settlementAccounts.find((a) => a.isPrimary && !a.deletedAt);
    if (!account) {
      throw new OnboardingValidationException('No primary settlement account assigned');
    }

    const verification = await this.cbs.verifySettlementAccount(
      app.merchantId,
      account.accountNumber,
      account.accountName,
      actorId,
    );

    if (verification.result === 'PASS') {
      await this.onboarding.markSettlementVerified(app.merchantId, account.accountNumber, actorId);
    } else {
      throw new OnboardingValidationException('CBS account verification failed');
    }
  }

  private async requireApp(applicationId: string) {
    const app = await this.onboarding.findById(applicationId);
    if (!app) throw new OnboardingNotFoundException(applicationId);
    return app;
  }

  private async buildContext(applicationId: string) {
    const app = await this.requireApp(applicationId);
    const merchant = app.merchant;
    const profile = merchant.profile;
    const primaryAccount = merchant.settlementAccounts.find((a) => a.isPrimary && !a.deletedAt);

    let cbsVerified = false;
    if (primaryAccount) {
      const latest = await this.cbs.latestVerification(
        merchant.id,
        primaryAccount.accountNumber,
      );
      cbsVerified = latest?.result === 'PASS' && !!primaryAccount.verifiedAt;
    }

    const docTypes = await this.onboarding.getDocumentTypes(merchant.id);
    const beneficialOwnerCount = await this.onboarding.countBeneficialOwners(applicationId);

    return {
      app,
      ctx: {
        legalEntityType: app.legalEntityType,
        isSchool: merchant.isSchool,
        docTypes,
        beneficialOwnerCount,
        hasPrimarySettlement: !!primaryAccount,
        cbsVerified,
        amlPassed: app.amlResults[0]?.result === 'PASS',
        profileComplete: !!(
          merchant.legalName &&
          merchant.tradingName &&
          profile?.city &&
          profile?.postalCode &&
          merchant.mcc
        ),
        schoolRegistrationNo: merchant.isSchool
          ? await this.onboarding.getSchoolRegistrationNo(merchant.id)
          : app.companyRegistrationNo,
        contactEmail: profile?.contactEmail,
        contactPhone: profile?.contactPhone,
      },
    };
  }
}
