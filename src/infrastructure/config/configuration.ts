export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL,
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    enabled: process.env.REDIS_ENABLED !== 'false',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    enabled: process.env.RABBITMQ_ENABLED !== 'false',
    exchange: process.env.RABBITMQ_EXCHANGE ?? 'mms.events',
  },
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    title: process.env.SWAGGER_TITLE ?? 'MMS API',
    description:
      process.env.SWAGGER_DESCRIPTION ??
      'Merchant Management System — Enterprise API',
    version: process.env.SWAGGER_VERSION ?? '1.0',
  },
  audit: {
    enabled: process.env.AUDIT_ENABLED !== 'false',
  },
  qr: {
    storagePath: process.env.QR_STORAGE_PATH ?? 'storage',
    storageBucket: process.env.QR_STORAGE_BUCKET ?? 'local',
  },
  mail: {
    enabled: process.env.MAIL_ENABLED === 'true',
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT ?? '587', 10),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM ?? 'MMS <noreply@mms.local>',
  },
  throttle: {
    // Default limit applies to all routes not given a stricter @Throttle()
    // override. Auth-specific limits are tighter to blunt credential
    // stuffing / brute force (brief §5).
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    defaultLimit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
    authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '5', 10),
  },
  // Argon2id parameters — OWASP Password Storage Cheat Sheet's primary
  // recommendation (m=19456 KiB / t=2 / p=1), chosen as a safe floor because
  // the target Hetzner instance's actual CPU/memory budget hasn't been
  // confirmed yet (brief §4, open question #1). Raise memoryCost first if
  // profiling on the real instance shows headroom — see
  // docs/architecture-decisions for the record of what's chosen and why.
  argon2: {
    memoryCostKib: parseInt(process.env.ARGON2_MEMORY_COST_KIB ?? '19456', 10),
    timeCost: parseInt(process.env.ARGON2_TIME_COST ?? '2', 10),
    parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '1', 10),
  },
  // Role codes treated as "privileged" for the forced-password-reset cutover
  // (brief §1.3), in addition to anyone holding a permission ending in
  // ":approve" (queried dynamically from RBAC — see
  // privileged-users.query.ts). SUPER_ADMIN/BANK_ADMIN are this codebase's
  // actual seeded roles; the brief's "Operations Manager" / "Compliance
  // Officer" don't exist as distinct roles yet — flagged for LFB
  // confirmation, not assumed.
  auth: {
    maxFailedAttempts: parseInt(
      process.env.AUTH_MAX_FAILED_ATTEMPTS ?? '5',
      10,
    ),
    lockoutDurationMinutes: parseInt(
      process.env.AUTH_LOCKOUT_MINUTES ?? '15',
      10,
    ),
    refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME ?? 'refreshToken',
    passwordResetExpiryHours: parseInt(
      process.env.AUTH_PASSWORD_RESET_HOURS ?? '1',
      10,
    ),
    inviteExpiryHours: parseInt(process.env.AUTH_INVITE_HOURS ?? '72', 10),
    privilegedRoleCodes: (
      process.env.AUTH_PRIVILEGED_ROLE_CODES ?? 'SUPER_ADMIN,BANK_ADMIN'
    )
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    // The date this migration's code went live — the 90-day backstop clock
    // starts here for every account, not from each account's creation date.
    argon2MigrationStartDate:
      process.env.ARGON2_MIGRATION_START_DATE ?? '2026-08-16',
    argon2BackstopDays: parseInt(process.env.ARGON2_BACKSTOP_DAYS ?? '90', 10),
    argon2BackstopWarningDays: parseInt(
      process.env.ARGON2_BACKSTOP_WARNING_DAYS ?? '7',
      10,
    ),
    mfaEncryptionKey:
      process.env.MFA_ENCRYPTION_KEY ??
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    mfaIssuer: process.env.MFA_ISSUER ?? 'MMS',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  },
});
