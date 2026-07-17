// ─── Routing keys (topic exchange) ──────────────────────────────────────────
// All consumers declare their queue with the matching binding key.

export const QUEUE_ROUTING = {
  STUDENT_ALIAS_GENERATE: 'student.alias.generate',
  NOTIFICATION_QR_EMAIL: 'notification.qr.email',
  NOTIFICATION_QR_SMS: 'notification.qr.sms',
} as const;

// ─── Queue names ─────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  STUDENT_ALIAS_GENERATE: 'mms.student.alias.generate',
  NOTIFICATION_QR_EMAIL: 'mms.notification.qr.email',
  NOTIFICATION_QR_SMS: 'mms.notification.qr.sms',
} as const;

// ─── Message payloads ────────────────────────────────────────────────────────

export interface StudentAliasGeneratePayload {
  studentId: string;
  merchantId: string;
  actorId?: string;
  batchId: string;
  row: number;
}

export interface NotifyQrEmailPayload {
  studentId: string;
  parentEmail: string;
  fullName: string;
  alias10digit: string;
  schoolName: string;
  tlvPayload: string;
}

export interface NotifyQrSmsPayload {
  guardianPhone: string;
  fullName: string;
  alias10digit: string;
  schoolName: string;
}
