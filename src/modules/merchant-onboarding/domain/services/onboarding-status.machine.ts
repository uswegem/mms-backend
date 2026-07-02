import { OnboardingStatus } from '@prisma/client';
import { OnboardingValidationException } from '../exceptions/onboarding.exceptions';

export type OnboardingAction =
  | 'SAVE_DRAFT'
  | 'SUBMIT'
  | 'KYC_APPROVE'
  | 'KYC_REJECT'
  | 'KYC_SEND_BACK'
  | 'RISK_APPROVE'
  | 'RISK_REJECT'
  | 'RISK_SEND_BACK'
  | 'BANK_VALIDATE'
  | 'BANK_VALIDATE_FAIL'
  | 'TPS_REGISTER'
  | 'TPS_RETRY'
  | 'TPS_FAIL'
  | 'ALIAS_QR_REGISTER'
  | 'ALIAS_QR_RETRY'
  | 'ALIAS_QR_FAIL'
  | 'SETTLEMENT_SAVE'
  | 'SETTLEMENT_SUBMIT'
  | 'SETTLEMENT_APPROVE'
  | 'SETTLEMENT_REJECT'
  | 'ACTIVATE'
  | 'REJECT'
  | 'SUSPEND'
  | 'RESUBMIT'
  | 'MAKER_APPROVE'
  | 'CHECKER_APPROVE';

const TRANSITIONS: Record<
  OnboardingStatus,
  Partial<Record<OnboardingAction, OnboardingStatus>>
> = {
  DRAFT: {
    SAVE_DRAFT: 'DRAFT',
    SUBMIT: 'SUBMITTED',
  },
  SUBMITTED: {
    MAKER_APPROVE: 'UNDER_REVIEW',
    KYC_REJECT: 'KYC_REJECTED',
    KYC_SEND_BACK: 'DRAFT',
    REJECT: 'REJECTED',
  },
  PENDING_KYC_DOCUMENTS: {
    SAVE_DRAFT: 'DRAFT',
    SUBMIT: 'SUBMITTED',
  },
  PENDING_KYC_APPROVAL: {
    KYC_APPROVE: 'PENDING_RISK_REVIEW',
    MAKER_APPROVE: 'UNDER_REVIEW',
    CHECKER_APPROVE: 'PENDING_BANK_VALIDATION',
    KYC_REJECT: 'KYC_REJECTED',
    KYC_SEND_BACK: 'DRAFT',
    REJECT: 'REJECTED',
  },
  KYC_REJECTED: {
    RESUBMIT: 'DRAFT',
    REJECT: 'REJECTED',
  },
  PENDING_RISK_REVIEW: {
    RISK_APPROVE: 'PENDING_BANK_VALIDATION',
    RISK_REJECT: 'RISK_REJECTED',
    RISK_SEND_BACK: 'DRAFT',
    REJECT: 'REJECTED',
  },
  RISK_REJECTED: {
    RESUBMIT: 'DRAFT',
    REJECT: 'REJECTED',
  },
  PENDING_BANK_VALIDATION: {
    BANK_VALIDATE: 'BANK_VALIDATED',
    BANK_VALIDATE_FAIL: 'BANK_VALIDATION_FAILED',
  },
  BANK_VALIDATION_FAILED: {
    BANK_VALIDATE: 'BANK_VALIDATED',
    REJECT: 'REJECTED',
  },
  BANK_VALIDATED: {
    TPS_REGISTER: 'TPS_REGISTERED',
    TPS_FAIL: 'TPS_REGISTRATION_FAILED',
  },
  PENDING_TPS_REGISTRATION: {
    TPS_REGISTER: 'TPS_REGISTERED',
    TPS_FAIL: 'TPS_REGISTRATION_FAILED',
  },
  TPS_REGISTRATION_FAILED: {
    TPS_RETRY: 'PENDING_TPS_REGISTRATION',
    TPS_REGISTER: 'TPS_REGISTERED',
    REJECT: 'REJECTED',
  },
  TPS_REGISTERED: {
    ALIAS_QR_REGISTER: 'ALIAS_QR_REGISTERED',
    ALIAS_QR_FAIL: 'ALIAS_QR_FAILED',
  },
  PENDING_ALIAS_QR_SETUP: {
    ALIAS_QR_REGISTER: 'ALIAS_QR_REGISTERED',
    ALIAS_QR_FAIL: 'ALIAS_QR_FAILED',
  },
  ALIAS_QR_FAILED: {
    ALIAS_QR_RETRY: 'PENDING_ALIAS_QR_SETUP',
    ALIAS_QR_REGISTER: 'ALIAS_QR_REGISTERED',
    REJECT: 'REJECTED',
  },
  ALIAS_QR_REGISTERED: {
    ACTIVATE: 'READY_FOR_ACTIVATION',
    SETTLEMENT_SAVE: 'PENDING_SETTLEMENT_SETUP',
    SETTLEMENT_SUBMIT: 'SETTLEMENT_APPROVAL_PENDING',
  },
  PENDING_SETTLEMENT_SETUP: {
    SETTLEMENT_SAVE: 'PENDING_SETTLEMENT_SETUP',
    SETTLEMENT_SUBMIT: 'SETTLEMENT_APPROVAL_PENDING',
  },
  SETTLEMENT_APPROVAL_PENDING: {
    SETTLEMENT_APPROVE: 'SETTLEMENT_APPROVED',
    SETTLEMENT_REJECT: 'SETTLEMENT_REJECTED',
  },
  SETTLEMENT_REJECTED: {
    SETTLEMENT_SAVE: 'PENDING_SETTLEMENT_SETUP',
    SETTLEMENT_SUBMIT: 'SETTLEMENT_APPROVAL_PENDING',
  },
  SETTLEMENT_APPROVED: {
    ACTIVATE: 'READY_FOR_ACTIVATION',
  },
  READY_FOR_ACTIVATION: {
    ACTIVATE: 'ACTIVE',
    REJECT: 'REJECTED',
  },
  ACTIVE: {
    SUSPEND: 'SUSPENDED',
  },
  REJECTED: {
    RESUBMIT: 'DRAFT',
  },
  SUSPENDED: {},
  FAILED: {
    RESUBMIT: 'DRAFT',
  },
  UNDER_REVIEW: {
    CHECKER_APPROVE: 'PENDING_BANK_VALIDATION',
    KYC_REJECT: 'KYC_REJECTED',
    KYC_SEND_BACK: 'DRAFT',
    REJECT: 'REJECTED',
  },
  APPROVED: {
    ACTIVATE: 'ACTIVE',
  },
};

export const EDITABLE_STATUSES: OnboardingStatus[] = [
  'DRAFT',
  'KYC_REJECTED',
  'RISK_REJECTED',
  'BANK_VALIDATION_FAILED',
  'TPS_REGISTRATION_FAILED',
  'ALIAS_QR_FAILED',
  'SETTLEMENT_REJECTED',
  'REJECTED',
  'PENDING_KYC_DOCUMENTS',
  'PENDING_SETTLEMENT_SETUP',
];

export const DASHBOARD_STATUS_GROUPS: Record<string, OnboardingStatus[]> = {
  Draft: ['DRAFT', 'PENDING_KYC_DOCUMENTS'],
  Submitted: ['SUBMITTED', 'PENDING_KYC_APPROVAL', 'UNDER_REVIEW'],
  'Pending KYC': ['PENDING_KYC_APPROVAL', 'UNDER_REVIEW'],
  'Pending Risk': ['PENDING_RISK_REVIEW'],
  'Pending Bank': ['PENDING_BANK_VALIDATION', 'BANK_VALIDATION_FAILED'],
  'Pending TPS': ['PENDING_TPS_REGISTRATION', 'TPS_REGISTRATION_FAILED'],
  'Pending QR/Alias': ['PENDING_ALIAS_QR_SETUP', 'ALIAS_QR_FAILED'],
  'Pending Settlement': [
    'PENDING_SETTLEMENT_SETUP',
    'SETTLEMENT_APPROVAL_PENDING',
    'SETTLEMENT_REJECTED',
  ],
  'Ready for Activation': ['READY_FOR_ACTIVATION', 'SETTLEMENT_APPROVED'],
  Active: ['ACTIVE', 'APPROVED'],
  Rejected: ['REJECTED', 'KYC_REJECTED', 'RISK_REJECTED', 'FAILED'],
};

export class OnboardingStatusMachine {
  static canTransition(
    from: OnboardingStatus,
    action: OnboardingAction,
  ): boolean {
    return !!TRANSITIONS[from]?.[action];
  }

  static transition(
    from: OnboardingStatus,
    action: OnboardingAction,
  ): OnboardingStatus {
    const next = TRANSITIONS[from]?.[action];
    if (!next) {
      throw new OnboardingValidationException(
        `Invalid transition: cannot perform ${action} from status ${from}`,
      );
    }
    return next;
  }

  static isEditable(status: OnboardingStatus): boolean {
    return EDITABLE_STATUSES.includes(status);
  }

  static canActivate(status: OnboardingStatus): boolean {
    return (
      status === 'READY_FOR_ACTIVATION' ||
      status === 'ALIAS_QR_REGISTERED' ||
      status === 'SETTLEMENT_APPROVED'
    );
  }

  static mandatoryStepsComplete(status: OnboardingStatus): boolean {
    return [
      'SETTLEMENT_APPROVED',
      'READY_FOR_ACTIVATION',
      'ACTIVE',
      'APPROVED',
    ].includes(status);
  }
}
