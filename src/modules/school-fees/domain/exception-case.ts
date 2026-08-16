import { createHash } from 'crypto';
import {
  ExceptionCaseStatus,
  MatchGroupStatus,
  ReconciliationClassification,
} from '@prisma/client';

export const OPEN_EXCEPTION_STATUSES: ExceptionCaseStatus[] = [
  ExceptionCaseStatus.OPEN,
  ExceptionCaseStatus.UNDER_INVESTIGATION,
  ExceptionCaseStatus.PENDING_APPROVAL,
  ExceptionCaseStatus.ESCALATED,
];

export const FINANCIAL_EXCEPTION_ACTIONS = [
  'MANUAL_MATCH',
  'FORCE_CREATE_PAYMENT',
  'REVERSE_PAYMENT',
  'WRITE_OFF',
] as const;

export type FinancialExceptionAction = (typeof FINANCIAL_EXCEPTION_ACTIONS)[number];

export function isFinancialAction(action: string): action is FinancialExceptionAction {
  return (FINANCIAL_EXCEPTION_ACTIONS as readonly string[]).includes(action);
}

export function exceptionFingerprint(parts: {
  classification: ReconciliationClassification;
  merchantId?: string | null;
  paymentIds?: string[];
  externalIds?: string[];
  reference?: string | null;
}): string {
  const payload = [
    parts.classification,
    parts.merchantId ?? '',
    ...(parts.paymentIds ?? []).slice().sort(),
    ...(parts.externalIds ?? []).slice().sort(),
    parts.reference ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function classifyMatchGroupStatus(
  legs: { legType: string }[],
  conflict = false,
): MatchGroupStatus {
  if (conflict) return MatchGroupStatus.CONFLICT;
  const types = new Set(legs.map((leg) => String(leg.legType)));
  const has = {
    MMS: types.has('MMS'),
    TIPS: types.has('TIPS'),
    CBS: types.has('CBS'),
  };
  if (has.MMS && has.TIPS && has.CBS) return MatchGroupStatus.FULLY_MATCHED;
  if (has.MMS && has.TIPS) return MatchGroupStatus.MMS_TIPS_ONLY;
  if (has.MMS && has.CBS) return MatchGroupStatus.MMS_CBS_ONLY;
  if (has.TIPS && has.CBS) return MatchGroupStatus.TIPS_CBS_ONLY;
  if (has.MMS) return MatchGroupStatus.MMS_ONLY;
  if (has.TIPS) return MatchGroupStatus.TIPS_ONLY;
  return MatchGroupStatus.CBS_ONLY;
}

export function exceptionClassificationForGroup(status: MatchGroupStatus): ReconciliationClassification | null {
  switch (status) {
    case MatchGroupStatus.FULLY_MATCHED:
      return null;
    case MatchGroupStatus.MMS_TIPS_ONLY:
      return ReconciliationClassification.MISSING_CBS_LEG;
    case MatchGroupStatus.MMS_CBS_ONLY:
      return ReconciliationClassification.MISSING_TIPS_LEG;
    case MatchGroupStatus.TIPS_CBS_ONLY:
      return ReconciliationClassification.MMS_MISSING;
    case MatchGroupStatus.MMS_ONLY:
      return ReconciliationClassification.UNMATCHED_INTERNAL;
    case MatchGroupStatus.TIPS_ONLY:
      return ReconciliationClassification.ORPHAN_TIPS;
    case MatchGroupStatus.CBS_ONLY:
      return ReconciliationClassification.ORPHAN_CBS;
    case MatchGroupStatus.CONFLICT:
      return ReconciliationClassification.CROSS_LEG_AMOUNT_CONFLICT;
    default:
      return ReconciliationClassification.UNMATCHED_EXTERNAL;
  }
}

export function severityForClassification(classification: ReconciliationClassification) {
  switch (classification) {
    case ReconciliationClassification.CROSS_LEG_AMOUNT_CONFLICT:
    case ReconciliationClassification.AMOUNT_MISMATCH:
    case ReconciliationClassification.BULK_SUM_MISMATCH:
      return 'HIGH' as const;
    case ReconciliationClassification.DATE_VARIANCE_REVIEW:
    case ReconciliationClassification.MMS_MISSING:
    case ReconciliationClassification.MISSING_CBS_LEG:
    case ReconciliationClassification.MISSING_TIPS_LEG:
      return 'MEDIUM' as const;
    case ReconciliationClassification.ORPHAN_CBS:
    case ReconciliationClassification.ORPHAN_TIPS:
    case ReconciliationClassification.UNMATCHED_EXTERNAL:
    case ReconciliationClassification.UNMATCHED_INTERNAL:
      return 'LOW' as const;
    default:
      return 'MEDIUM' as const;
  }
}

const CASE_TRANSITIONS: Record<ExceptionCaseStatus, ExceptionCaseStatus[]> = {
  OPEN: [ExceptionCaseStatus.UNDER_INVESTIGATION, ExceptionCaseStatus.PENDING_APPROVAL, ExceptionCaseStatus.ESCALATED, ExceptionCaseStatus.AUTO_CLOSED, ExceptionCaseStatus.CLOSED],
  UNDER_INVESTIGATION: [ExceptionCaseStatus.PENDING_APPROVAL, ExceptionCaseStatus.RESOLVED, ExceptionCaseStatus.ESCALATED, ExceptionCaseStatus.CLOSED],
  PENDING_APPROVAL: [ExceptionCaseStatus.RESOLVED, ExceptionCaseStatus.UNDER_INVESTIGATION, ExceptionCaseStatus.ESCALATED],
  RESOLVED: [ExceptionCaseStatus.CLOSED],
  ESCALATED: [ExceptionCaseStatus.UNDER_INVESTIGATION, ExceptionCaseStatus.PENDING_APPROVAL, ExceptionCaseStatus.RESOLVED, ExceptionCaseStatus.CLOSED],
  CLOSED: [],
  AUTO_CLOSED: [],
};

export function assertExceptionTransition(from: ExceptionCaseStatus, to: ExceptionCaseStatus) {
  if (from === to) return;
  const allowed = CASE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid exception case transition ${from} → ${to}`);
  }
}

export function amountsConflict(
  amounts: Array<{ equals(other: unknown): boolean } | null | undefined>,
): boolean {
  const present = amounts.filter(Boolean) as Array<{ equals(other: unknown): boolean }>;
  if (present.length < 2) return false;
  return present.some((amount) => !amount.equals(present[0]));
}
