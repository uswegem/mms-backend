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
  auth: {
    maxFailedAttempts: parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? '5', 10),
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
    mfaEncryptionKey:
      process.env.MFA_ENCRYPTION_KEY ??
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    mfaIssuer: process.env.MFA_ISSUER ?? 'MMS',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  },
});
