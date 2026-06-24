/** System roles — aligned with BRD and User Management module */
export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  BANK_ADMIN = 'BANK_ADMIN',
  OPERATIONS_USER = 'OPERATIONS_USER',
  MERCHANT_ADMIN = 'MERCHANT_ADMIN',
  MERCHANT_USER = 'MERCHANT_USER',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
}

/** Acquirer-level roles — cannot be assigned by merchant admins */
export const ACQUIRER_LEVEL_ROLES: SystemRole[] = [
  SystemRole.SUPER_ADMIN,
  SystemRole.BANK_ADMIN,
  SystemRole.OPERATIONS_USER,
];

export const MERCHANT_LEVEL_ROLES: SystemRole[] = [
  SystemRole.MERCHANT_ADMIN,
  SystemRole.MERCHANT_USER,
  SystemRole.SCHOOL_ADMIN,
];
