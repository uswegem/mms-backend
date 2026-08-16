import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@mms.local';
const ADMIN_PASSWORD = 'Admin@12345678';

const PERMISSIONS = [
  { code: 'auth:login', module: 'auth', description: 'Login and logout' },
  {
    code: 'auth:session:revoke-all',
    module: 'auth',
    description: 'Revoke all sessions',
  },
  { code: 'auth:mfa:manage', module: 'auth', description: 'Manage MFA' },
  { code: 'authz:role:read', module: 'authz', description: 'Read roles' },
  {
    code: 'authz:role:write',
    module: 'authz',
    description: 'Create and manage custom roles',
  },
  {
    code: 'authz:permission:read',
    module: 'authz',
    description: 'Read permission catalog',
  },
  {
    code: 'authz:policy:override',
    module: 'authz',
    description: 'Manage policy overrides',
  },
  { code: 'authz:me', module: 'authz', description: 'View own permissions' },
  { code: 'user:read', module: 'users', description: 'List and read users' },
  {
    code: 'user:write',
    module: 'users',
    description: 'Create and update users',
  },
  { code: 'user:deactivate', module: 'users', description: 'Deactivate users' },
  { code: 'user:invite', module: 'users', description: 'Invite users' },
  { code: 'user:role:assign', module: 'users', description: 'Assign roles' },
  {
    code: 'user:merchant:manage',
    module: 'users',
    description: 'Manage merchant-scoped users',
  },
  { code: 'merchant:read', module: 'merchants', description: 'Read merchants' },
  {
    code: 'merchant:write',
    module: 'merchants',
    description: 'Create and update merchants',
  },
  {
    code: 'merchant:suspend',
    module: 'merchants',
    description: 'Suspend, activate, dormant merchants',
  },
  {
    code: 'merchant:close',
    module: 'merchants',
    description: 'Close merchants',
  },
  {
    code: 'merchant:status:submit',
    module: 'merchants',
    description: 'Submit merchant for review',
  },
  {
    code: 'merchant:status:approve',
    module: 'merchants',
    description: 'Maker move to pending approval',
  },
  {
    code: 'merchant:status:checker:approve',
    module: 'merchants',
    description: 'Checker approve merchant',
  },
  {
    code: 'merchant:status:reject',
    module: 'merchants',
    description: 'Reject merchant status',
  },
  {
    code: 'merchant:kyc:read',
    module: 'merchants',
    description: 'Read merchant KYC documents',
  },
  {
    code: 'merchant:kyc:write',
    module: 'merchants',
    description: 'Upload and submit KYC',
  },
  {
    code: 'merchant:kyc:review',
    module: 'merchants',
    description: 'Review merchant KYC',
  },
  {
    code: 'onboarding:read',
    module: 'onboarding',
    description: 'View onboarding applications',
  },
  {
    code: 'onboarding:write',
    module: 'onboarding',
    description: 'Create and edit onboarding applications',
  },
  {
    code: 'onboarding:submit',
    module: 'onboarding',
    description: 'Submit onboarding for approval',
  },
  {
    code: 'onboarding:approve',
    module: 'onboarding',
    description: 'Maker approve onboarding',
  },
  {
    code: 'onboarding:reject',
    module: 'onboarding',
    description: 'Reject onboarding application',
  },
  {
    code: 'onboarding:aml:trigger',
    module: 'onboarding',
    description: 'Trigger AML screening',
  },
  {
    code: 'approval:task:read',
    module: 'approvals',
    description: 'View approval tasks',
  },
  {
    code: 'approval:task:approve',
    module: 'approvals',
    description: 'Checker approve tasks',
  },
  {
    code: 'approval:task:reject',
    module: 'approvals',
    description: 'Checker reject tasks',
  },
  {
    code: 'school:read',
    module: 'school',
    description: 'View school profiles',
  },
  {
    code: 'school:write',
    module: 'school',
    description: 'Manage school profiles',
  },
  {
    code: 'school:onboarding',
    module: 'school',
    description: 'Start school onboarding',
  },
  {
    code: 'school:student:read',
    module: 'school',
    description: 'View school students',
  },
  {
    code: 'school:student:write',
    module: 'school',
    description: 'Enrol school students',
  },
  {
    code: 'school:student:bulk',
    module: 'school',
    description: 'Bulk student CSV upload',
  },
  {
    code: 'alias:read',
    module: 'alias',
    description: 'Read Lipa Namba aliases',
  },
  {
    code: 'alias:lookup',
    module: 'alias',
    description: 'Lookup alias ownership',
  },
  { code: 'qr:read', module: 'qr', description: 'Read QR codes' },
  { code: 'qr:generate', module: 'qr', description: 'Generate TANQR codes' },
  {
    code: 'transactions:read',
    module: 'transactions',
    description: 'Read transactions',
  },
  {
    code: 'transactions:override',
    module: 'transactions',
    description: 'Manually override a stuck/disputed payment status',
  },
  {
    code: 'settlements:read',
    module: 'settlements',
    description: 'Read settlement cycles',
  },
  {
    code: 'settlements:approve',
    module: 'settlements',
    description: 'Approve/re-run a settlement cycle',
  },
  {
    code: 'reconciliation:read',
    module: 'reconciliation',
    description: 'Read reconciliation exceptions',
  },
  {
    code: 'reconciliation:resolve',
    module: 'reconciliation',
    description: 'Resolve a reconciliation exception',
  },
  { code: 'audit:read', module: 'audit', description: 'Read audit logs' },
];

const ROLES: Array<{
  code: string;
  name: string;
  permissions: string[];
}> = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    code: 'BANK_ADMIN',
    name: 'Bank Admin',
    permissions: [
      'auth:login',
      'auth:session:revoke-all',
      'auth:mfa:manage',
      'authz:role:read',
      'authz:role:write',
      'authz:permission:read',
      'authz:policy:override',
      'authz:me',
      'user:read',
      'user:write',
      'user:deactivate',
      'user:invite',
      'user:role:assign',
      'merchant:read',
      'merchant:write',
      'merchant:suspend',
      'merchant:close',
      'merchant:status:submit',
      'merchant:status:approve',
      'merchant:status:checker:approve',
      'merchant:status:reject',
      'merchant:kyc:read',
      'merchant:kyc:write',
      'merchant:kyc:review',
      'onboarding:read',
      'onboarding:write',
      'onboarding:submit',
      'onboarding:approve',
      'onboarding:reject',
      'onboarding:aml:trigger',
      'approval:task:read',
      'approval:task:approve',
      'approval:task:reject',
      'school:read',
      'school:write',
      'school:onboarding',
      'school:student:read',
      'school:student:write',
      'school:student:bulk',
      'alias:read',
      'alias:lookup',
      'qr:read',
      'qr:generate',
      'transactions:read',
      'transactions:override',
      'settlements:read',
      'settlements:approve',
      'reconciliation:read',
      'reconciliation:resolve',
      'audit:read',
    ],
  },
  {
    code: 'OPERATIONS_USER',
    name: 'Operations User',
    permissions: [
      'auth:login',
      'authz:me',
      'user:read',
      'merchant:read',
      'merchant:kyc:read',
      'onboarding:read',
      'onboarding:write',
      'onboarding:submit',
      'approval:task:read',
      'school:read',
      'school:onboarding',
      'transactions:read',
      'transactions:override',
      'settlements:read',
      'reconciliation:read',
      'reconciliation:resolve',
    ],
  },
  {
    code: 'MERCHANT_ADMIN',
    name: 'Merchant Admin',
    permissions: [
      'auth:login',
      'authz:me',
      'user:read',
      'user:write',
      'user:invite',
      'user:role:assign',
      'user:merchant:manage',
      'merchant:read',
      'merchant:kyc:read',
      'merchant:kyc:write',
      'onboarding:read',
      'onboarding:write',
      'onboarding:submit',
    ],
  },
  {
    code: 'MERCHANT_USER',
    name: 'Merchant User',
    permissions: [
      'auth:login',
      'authz:me',
      'user:read',
      'merchant:read',
      'merchant:kyc:read',
    ],
  },
  {
    code: 'SCHOOL_ADMIN',
    name: 'School Admin',
    permissions: [
      'auth:login',
      'authz:me',
      'user:read',
      'user:write',
      'user:invite',
      'user:role:assign',
      'user:merchant:manage',
      'merchant:read',
      'merchant:kyc:read',
      'merchant:kyc:write',
      'school:read',
      'school:write',
      'school:onboarding',
      'school:student:read',
      'school:student:write',
      'school:student:bulk',
      'alias:read',
      'qr:read',
      'onboarding:read',
      'onboarding:write',
      'onboarding:submit',
    ],
  },
];

async function main() {
  const acquirer = await prisma.acquirer.upsert({
    where: { code: 'DEMO' },
    update: {
      tipsAcquirerId5: '01044',
      tipsParticipantCode: '044',
    },
    create: {
      code: 'DEMO',
      legalName: 'Demo Acquirer Bank PLC',
      tradingName: 'Demo Acquirer',
      status: 'ACTIVE',
      // TANQR acquirer category '01' (bank) + acquirer code '044' per the BoT
      // TANQR Code Standard 2022.
      tipsAcquirerId5: '01044',
      tipsParticipantCode: '044',
    },
  });

  for (const block of ['780', '781', '782']) {
    await prisma.aliasBlockSequence.upsert({
      where: { block },
      update: {},
      create: { block, lastSeq: 0 },
    });
  }

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { module: perm.module, description: perm.description },
      create: perm,
    });
  }

  const permissionMap = new Map(
    (await prisma.permission.findMany()).map((p) => [p.code, p.id]),
  );

  const roleRecords: Record<string, string> = {};

  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where: {
        acquirerId_code: { acquirerId: acquirer.id, code: roleDef.code },
      },
      update: { name: roleDef.name },
      create: {
        acquirerId: acquirer.id,
        code: roleDef.code,
        name: roleDef.name,
        isSystem: true,
      },
    });
    roleRecords[roleDef.code] = role.id;

    for (const permCode of roleDef.permissions) {
      const permissionId = permissionMap.get(permCode);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  let user = await prisma.user.findFirst({
    where: { acquirerId: acquirer.id, email: ADMIN_EMAIL },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        acquirerId: acquirer.id,
        email: ADMIN_EMAIL,
        fullName: 'System Administrator',
        status: 'ACTIVE',
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ACTIVE' },
    });
  }

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await prisma.authCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash },
    create: { userId: user.id, passwordHash },
  });

  const superAdminRoleId = roleRecords['SUPER_ADMIN'];
  const existingRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: superAdminRoleId },
  });
  if (!existingRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: superAdminRoleId,
        scopeType: 'ACQUIRER',
        scopeId: acquirer.id,
      },
    });
  }

  const rejectionReasons = [
    {
      code: 'INCOMPLETE_KYC',
      description: 'Mandatory KYC documents missing or invalid',
    },
    { code: 'AML_FAIL', description: 'AML screening failed' },
    {
      code: 'ACCOUNT_MISMATCH',
      description: 'Settlement account verification failed',
    },
    {
      code: 'INVALID_PROFILE',
      description: 'Merchant profile data incomplete',
    },
    { code: 'POLICY_VIOLATION', description: 'Does not meet acquirer policy' },
    { code: 'OTHER', description: 'Other — see notes' },
  ];
  for (const reason of rejectionReasons) {
    await prisma.onboardingRejectionReason.upsert({
      where: { code: reason.code },
      update: { description: reason.description },
      create: reason,
    });
  }

  for (const entityType of [
    'MERCHANT_ONBOARDING',
    'SCHOOL_ONBOARDING',
    'MERCHANT_STATUS_CHANGE',
  ] as const) {
    await prisma.approvalPolicy.upsert({
      where: {
        acquirerId_entityType: { acquirerId: acquirer.id, entityType },
      },
      update: {},
      create: {
        acquirerId: acquirer.id,
        entityType,
        enabled: true,
        slaHours: entityType === 'SCHOOL_ONBOARDING' ? 48 : 24,
      },
    });
  }

  console.log('Seed complete');
  console.log(`  Acquirer: ${acquirer.code}`);
  console.log(`  Roles:    ${ROLES.map((r) => r.code).join(', ')}`);
  console.log(`  Admin:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
