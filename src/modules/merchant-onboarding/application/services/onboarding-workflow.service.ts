import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ApprovalEntityType,
  AmlResult,
  LegalEntityType,
} from '@prisma/client';
import { CbsVerificationService } from '@modules/cbs/application/services/cbs-verification.service';
import { MakerCheckerService } from '@modules/maker-checker/application/services/maker-checker.service';
import { OnboardingApprovalPort } from '@modules/maker-checker/application/ports/onboarding-approval.port';
import {
  SCHOOL_ONBOARDING_COMPLETION_PORT,
  type SchoolOnboardingCompletionPort,
} from '@modules/maker-checker/application/ports/school-onboarding-completion.port';
import { OnboardingRepository } from '../../infrastructure/persistence/onboarding.repository';
import { OnboardingValidationService } from '../../domain/services/onboarding-validation.service';
import {
  OnboardingNotFoundException,
  OnboardingValidationException,
} from '../../domain/exceptions/onboarding.exceptions';

@Injectable()
export class OnboardingWorkflowService implements OnboardingApprovalPort {
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly cbs: CbsVerificationService,
    private readonly makerChecker: MakerCheckerService,
    @Optional()
    @Inject(SCHOOL_ONBOARDING_COMPLETION_PORT)
    private readonly schoolCompletion?: SchoolOnboardingCompletionPort,
  ) {}

  async buildValidationContext(applicationId: string) {
    const app = await this.onboarding.findById(applicationId);
    if (!app) throw new OnboardingNotFoundException(applicationId);

    const merchant = app.merchant;
    const profile = merchant.profile;
    const primaryAccount = merchant.settlementAccounts.find(
      (a) => a.isPrimary && !a.deletedAt,
    );

    let cbsVerified = false;
    if (primaryAccount) {
      const latest = await this.cbs.latestVerification(
        merchant.id,
        primaryAccount.accountNumber,
      );
      cbsVerified = latest?.result === 'PASS' && !!primaryAccount.verifiedAt;
    }

    const docTypes = await this.onboarding.getDocumentTypes(merchant.id);
    const beneficialOwnerCount = await this.onboarding.countBeneficialOwners(
      applicationId,
    );

    return {
      app,
      ctx: {
        legalEntityType: app.legalEntityType,
        isSchool: merchant.isSchool,
        docTypes,
        beneficialOwnerCount,
        hasPrimarySettlement: !!primaryAccount,
        cbsVerified,
        amlPassed: app.amlResults[0]?.result === AmlResult.PASS,
        profileComplete: !!(
          merchant.legalName &&
          merchant.tradingName &&
          profile?.city &&
          profile?.postalCode &&
          merchant.mcc
        ),
      },
    };
  }

  async runAmlScreen(applicationId: string) {
    const app = await this.onboarding.findById(applicationId);
    if (!app) throw new OnboardingNotFoundException(applicationId);
    return this.onboarding.recordAml(applicationId, AmlResult.PASS, `AML-${Date.now()}`);
  }

  async verifySettlement(
    applicationId: string,
    verifiedBy: string,
  ): Promise<{ result: string }> {
    const app = await this.onboarding.findById(applicationId);
    if (!app) throw new OnboardingNotFoundException(applicationId);

    const account = app.merchant.settlementAccounts.find(
      (a) => a.isPrimary && !a.deletedAt,
    );
    if (!account) {
      throw new OnboardingValidationException('No primary settlement account assigned');
    }

    const verification = await this.cbs.verifySettlementAccount(
      app.merchantId,
      account.accountNumber,
      account.accountName,
      verifiedBy,
    );

    if (verification.result === 'PASS') {
      await this.onboarding.markSettlementVerified(
        app.merchantId,
        account.accountNumber,
        verifiedBy,
      );
    } else {
      throw new OnboardingValidationException(
        'CBS account verification failed — account number or name mismatch',
      );
    }

    return { result: verification.result };
  }

  async submitForApproval(applicationId: string, actorId: string) {
    const { app, ctx } = await this.buildValidationContext(applicationId);

    if (app.status !== 'DRAFT' && app.status !== 'REJECTED') {
      throw new OnboardingValidationException(
        'Only draft or rejected applications can be submitted',
      );
    }

    if (!ctx.amlPassed) {
      await this.runAmlScreen(applicationId);
      const refreshed = await this.buildValidationContext(applicationId);
      OnboardingValidationService.assertCanSubmit(refreshed.ctx);
    } else {
      OnboardingValidationService.assertCanSubmit(ctx);
    }

    if (app.legalEntityType === LegalEntityType.SOLE_PROPRIETOR && ctx.beneficialOwnerCount === 0) {
      // Sole prop — skip beneficial owners step
    }

    return this.onboarding.submit(applicationId);
  }

  async makerApprove(applicationId: string, makerId: string, acquirerId: string) {
    const app = await this.onboarding.findById(applicationId);
    if (!app) throw new OnboardingNotFoundException(applicationId);

    if (app.status !== 'SUBMITTED') {
      throw new OnboardingValidationException(
        'Application must be in SUBMITTED status for maker approval',
      );
    }

    const entityType = app.merchant.isSchool
      ? ApprovalEntityType.SCHOOL_ONBOARDING
      : ApprovalEntityType.MERCHANT_ONBOARDING;

    const updated = await this.onboarding.makerApprove(applicationId, makerId);

    if (await this.makerChecker.isEnabled(acquirerId, entityType)) {
      await this.makerChecker.createTask(
        acquirerId,
        entityType,
        applicationId,
        makerId,
      );
    } else {
      await this.onboarding.checkerApprove(applicationId, makerId);
      if (app.merchant.isSchool && this.schoolCompletion) {
        await this.schoolCompletion.onSchoolApprovedByApplication(
          applicationId,
          makerId,
        );
      }
    }

    return updated;
  }

  async onCheckerApproved(applicationId: string, checkerId: string): Promise<void> {
    await this.onboarding.checkerApprove(applicationId, checkerId);
  }

  async onCheckerRejected(
    applicationId: string,
    checkerId: string,
    notes?: string,
  ): Promise<void> {
    await this.onboarding.reject(applicationId, checkerId, 'POLICY_VIOLATION', notes);
  }

  async rejectApplication(
    applicationId: string,
    reviewerId: string,
    rejectionCode: string,
    notes?: string,
  ) {
    return this.onboarding.reject(applicationId, reviewerId, rejectionCode, notes);
  }

  async resubmit(applicationId: string, actorId: string) {
    const app = await this.onboarding.findById(applicationId);
    if (!app) throw new OnboardingNotFoundException(applicationId);
    if (app.status !== 'REJECTED') {
      throw new OnboardingValidationException('Only rejected applications can be resubmitted');
    }
    return this.onboarding.resubmit(applicationId, actorId);
  }
}
