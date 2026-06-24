/**
 * System permissions — align with OpenAPI x-permission values.
 */
export enum Permission {
  // Authentication
  AUTH_LOGIN = 'auth:login',
  AUTH_SESSION_REVOKE_ALL = 'auth:session:revoke-all',
  AUTH_MFA_MANAGE = 'auth:mfa:manage',
  // Authorization
  AUTHZ_ROLE_READ = 'authz:role:read',
  AUTHZ_ME = 'authz:me',
  // User management
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DEACTIVATE = 'user:deactivate',
  USER_INVITE = 'user:invite',
  USER_ROLE_ASSIGN = 'user:role:assign',
  USER_MERCHANT_MANAGE = 'user:merchant:manage',
  // Merchant management
  MERCHANT_READ = 'merchant:read',
  MERCHANT_WRITE = 'merchant:write',
  MERCHANT_SUSPEND = 'merchant:suspend',
  MERCHANT_CLOSE = 'merchant:close',
  MERCHANT_STATUS_SUBMIT = 'merchant:status:submit',
  MERCHANT_STATUS_APPROVE = 'merchant:status:approve',
  MERCHANT_STATUS_CHECKER_APPROVE = 'merchant:status:checker:approve',
  MERCHANT_STATUS_REJECT = 'merchant:status:reject',
  MERCHANT_KYC_READ = 'merchant:kyc:read',
  MERCHANT_KYC_WRITE = 'merchant:kyc:write',
  MERCHANT_KYC_REVIEW = 'merchant:kyc:review',
  // Onboarding
  ONBOARDING_READ = 'onboarding:read',
  ONBOARDING_WRITE = 'onboarding:write',
  ONBOARDING_SUBMIT = 'onboarding:submit',
  ONBOARDING_APPROVE = 'onboarding:approve',
  ONBOARDING_REJECT = 'onboarding:reject',
  ONBOARDING_AML_TRIGGER = 'onboarding:aml:trigger',
  // Approvals (maker-checker)
  APPROVAL_TASK_READ = 'approval:task:read',
  APPROVAL_TASK_APPROVE = 'approval:task:approve',
  APPROVAL_TASK_REJECT = 'approval:task:reject',
  // School
  SCHOOL_READ = 'school:read',
  SCHOOL_WRITE = 'school:write',
  SCHOOL_ONBOARDING = 'school:onboarding',
  SCHOOL_STUDENT_READ = 'school:student:read',
  SCHOOL_STUDENT_WRITE = 'school:student:write',
  SCHOOL_STUDENT_BULK = 'school:student:bulk',
  // Alias
  ALIAS_READ = 'alias:read',
  ALIAS_LOOKUP = 'alias:lookup',
  // QR
  QR_READ = 'qr:read',
  QR_GENERATE = 'qr:generate',
  // Transactions
  TRANSACTIONS_READ = 'transactions:read',
  // Settlements
  SETTLEMENTS_READ = 'settlements:read',
  SETTLEMENTS_APPROVE = 'settlements:approve',
  // Admin
  CONFIG_WRITE = 'config:write',
  AUDIT_READ = 'audit:read',
}
