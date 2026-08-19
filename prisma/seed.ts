import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

// ─── Reference data (Milestone B) ─────────────────────────────────────────
// Region -> District -> Ward -> postcode hierarchy and bank/SWIFT catalog,
// sourced from a real public Tanzania administrative-locations dataset
// (see prisma/reference-data/tanzania-locations.json for provenance).

interface LocationWard {
  name: string;
  postcode: string;
}
interface LocationDistrict {
  name: string;
  wards: LocationWard[];
}
interface LocationRegion {
  region: string;
  districts: LocationDistrict[];
}
interface BankEntry {
  name: string;
  swiftCode: string;
}

async function seedReferenceData() {
  // One-time load: this dataset is administrative-boundary data that does
  // not change deploy-to-deploy, and reseeding thousands of ward rows on
  // every run (deploy.yml runs this seed unconditionally on every deploy)
  // would be wasted work at best. Skip entirely once any region exists.
  const alreadySeeded = (await prisma.referenceRegion.count()) > 0;
  if (alreadySeeded) {
    console.log('  Reference data: already seeded, skipping');
    return;
  }

  const locations = JSON.parse(
    readFileSync(
      join(__dirname, 'reference-data', 'tanzania-locations.json'),
      'utf8',
    ),
  ) as LocationRegion[];
  const banks = JSON.parse(
    readFileSync(
      join(__dirname, 'reference-data', 'tanzania-banks.json'),
      'utf8',
    ),
  ) as BankEntry[];

  let districtCount = 0;
  let wardCount = 0;

  for (const regionData of locations) {
    const region = await prisma.referenceRegion.create({
      data: { name: regionData.region },
    });

    for (const districtData of regionData.districts) {
      const district = await prisma.referenceDistrict.create({
        data: { regionId: region.id, name: districtData.name },
      });
      districtCount += 1;

      if (districtData.wards.length > 0) {
        await prisma.referenceWard.createMany({
          data: districtData.wards.map((w) => ({
            districtId: district.id,
            name: w.name,
            postcode: w.postcode,
          })),
          skipDuplicates: true,
        });
        wardCount += districtData.wards.length;
      }
    }
  }

  await prisma.referenceBank.createMany({
    data: banks.map((b) => ({ name: b.name, swiftCode: b.swiftCode })),
    skipDuplicates: true,
  });

  console.log(
    `  Reference data: ${locations.length} regions, ${districtCount} districts, ` +
      `${wardCount} wards, ${banks.length} banks`,
  );
}

// ─── Transaction limit policies (brief §4.3.3) ────────────────────────────
// PLACEHOLDER FIGURES — NOT REAL. The brief is explicit that actual TZS
// limits are Risk/Compliance's call, not engineering's, and are not yet
// set (open question #10). These exist only so the enforcement mechanism
// has something to enforce against in dev/UAT; every value here needs
// replacing with LFB Risk/Compliance-confirmed figures before production,
// as a config update (this table), not a code change.
const TRANSACTION_LIMIT_POLICIES: Array<{
  tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  perTransactionLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
}> = [
  // TIER_1 — online-only, lighter KYC: no onboarding path built yet, kept
  // deliberately conservative since it's the least-verified merchant class.
  {
    tier: 'TIER_1',
    perTransactionLimit: 500_000,
    dailyLimit: 1_000_000,
    monthlyLimit: 5_000_000,
  },
  // TIER_2 — standard Sole Proprietor / Company (the default for every
  // non-school merchant onboarded today).
  {
    tier: 'TIER_2',
    perTransactionLimit: 5_000_000,
    dailyLimit: 20_000_000,
    monthlyLimit: 100_000_000,
  },
  // TIER_3 — schools/institutional (higher ceiling: termly fee volume can
  // legitimately be large relative to a single merchant's daily takings).
  {
    tier: 'TIER_3',
    perTransactionLimit: 10_000_000,
    dailyLimit: 50_000_000,
    monthlyLimit: 300_000_000,
  },
];

async function seedTransactionLimitPolicies() {
  for (const policy of TRANSACTION_LIMIT_POLICIES) {
    await prisma.transactionLimitPolicy.upsert({
      where: { tier: policy.tier },
      update: {}, // never overwrite a value ops may have already tuned
      create: policy,
    });
  }
}

// ─── Fee schedule (handoff §ob7 / §cfgfees) ───────────────────────────────
// PLACEHOLDER FIGURES — taken from the design handoff's own worked example
// (§ob7's fee table), not confirmed by LFB Risk/Compliance/Pricing. Same
// caveat as TRANSACTION_LIMIT_POLICIES above: replace via the fee-schedules
// API before production, as a config change, not a code change. This seeds
// only the DEFAULT (global fallback) schedule — MCC- and merchant-scoped
// overrides are created later through that same API, not seeded.
const DEFAULT_FEE_SCHEDULE_CHARGES: Array<{
  chargeType:
    | 'MDR'
    | 'SETTLEMENT_TRANSFER'
    | 'QR_POSTER_REPRINT'
    | 'DISPUTE_INVESTIGATION';
  basis:
    | 'PERCENT_OF_TRANSACTION'
    | 'FLAT_PER_SWEEP'
    | 'FLAT_PER_ASSET'
    | 'FLAT_PER_CASE';
  rate?: number;
  flatAmount?: number;
  capAmount?: number;
}> = [
  { chargeType: 'MDR', basis: 'PERCENT_OF_TRANSACTION', rate: 0.0085, capAmount: 3000 },
  { chargeType: 'SETTLEMENT_TRANSFER', basis: 'FLAT_PER_SWEEP', flatAmount: 0 },
  { chargeType: 'QR_POSTER_REPRINT', basis: 'FLAT_PER_ASSET', flatAmount: 2000 },
  { chargeType: 'DISPUTE_INVESTIGATION', basis: 'FLAT_PER_CASE', flatAmount: 5000 },
];

async function seedDefaultFeeSchedule(adminUserId: string) {
  const existing = await prisma.feeSchedule.findFirst({
    where: { scope: 'DEFAULT', status: 'ACTIVE' },
  });
  if (existing) {
    console.log('  Fee schedule: DEFAULT already active, skipping');
    return;
  }

  const version = (await prisma.feeSchedule.count()) + 1;
  // createdBy === approvedBy only here, at bootstrap — the real activate
  // endpoint rejects that (maker cannot approve their own draft).
  await prisma.feeSchedule.create({
    data: {
      version,
      scope: 'DEFAULT',
      scopeKey: null,
      status: 'ACTIVE',
      effectiveFrom: new Date(),
      createdBy: adminUserId,
      approvedBy: adminUserId,
      approvedAt: new Date(),
      charges: { create: DEFAULT_FEE_SCHEDULE_CHARGES },
    },
  });
  console.log(`  Fee schedule: DEFAULT v${version} seeded and activated`);
}

// Overridable via env so a real deploy (uat/prod) can bootstrap with its own
// credential instead of this hardcoded dev default. Bootstrap-only: see the
// authCredential upsert below, which never overwrites an existing hash — a
// password rotated by ops after first deploy survives every later reseed.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@mms.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345678';

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
  {
    code: 'dispute:read',
    module: 'disputes',
    description: 'View disputes and their evidence',
  },
  {
    code: 'dispute:write',
    module: 'disputes',
    description: 'Raise a dispute, attach evidence, initiate or resolve a refund',
  },
  {
    code: 'payment-link:read',
    module: 'payment-links',
    description: 'View payment links and the storefront',
  },
  {
    code: 'payment-link:write',
    module: 'payment-links',
    description: 'Create, cancel, or reissue a payment link',
  },
  {
    // Pre-existing gap: TransactionLimitPolicyController has required this
    // since brief §4.3.3 landed, but it was never added here — meaning no
    // role, not even SUPER_ADMIN, could actually reach those routes.
    code: 'config:write',
    module: 'config',
    description: 'Manage system configuration (transaction limits, etc.)',
  },
  {
    code: 'fee-schedule:read',
    module: 'fee-schedule',
    description: 'View fee schedules and MDR configuration',
  },
  {
    code: 'fee-schedule:write',
    module: 'fee-schedule',
    description: 'Draft fee schedules',
  },
  {
    code: 'fee-schedule:approve',
    module: 'fee-schedule',
    description: 'Activate a fee schedule (maker-checker: cannot activate own draft)',
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
      'config:write',
      'fee-schedule:read',
      'fee-schedule:write',
      'fee-schedule:approve',
      'dispute:read',
      'dispute:write',
      'payment-link:read',
      'payment-link:write',
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
      'dispute:read',
      'dispute:write',
      'payment-link:read',
      'payment-link:write',
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
      'transactions:read',
      'settlements:read',
      'qr:read',
      'alias:read',
      'dispute:read',
      'dispute:write',
      'payment-link:read',
      'payment-link:write',
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
      'transactions:read',
      'qr:read',
      'alias:read',
      'dispute:read',
      'dispute:write',
      'payment-link:read',
      'payment-link:write',
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
      'transactions:read',
      'settlements:read',
      'dispute:read',
      'dispute:write',
      'payment-link:read',
      'payment-link:write',
    ],
  },
];

async function main() {
  await seedReferenceData();
  await seedTransactionLimitPolicies();

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

  // Bootstrap-only write: the seed must be safe to rerun on every deploy
  // (deploy.yml runs it unconditionally against both uat and prod), so this
  // must never overwrite a password an operator has since rotated. Only set
  // the hash the first time this credential row is created.
  const existingCredential = await prisma.authCredential.findUnique({
    where: { userId: user.id },
  });
  if (!existingCredential) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await prisma.authCredential.create({
      data: { userId: user.id, passwordHash },
    });
  }

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

  await seedDefaultFeeSchedule(user.id);

  console.log('Seed complete');
  console.log(`  Acquirer: ${acquirer.code}`);
  console.log(`  Roles:    ${ROLES.map((r) => r.code).join(', ')}`);
  console.log(`  Admin:    ${ADMIN_EMAIL}`);
  console.log(
    existingCredential
      ? '  Password: (unchanged — existing credential, not reset by seed)'
      : `  Password: ${ADMIN_PASSWORD} (bootstrap — rotate this immediately)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
