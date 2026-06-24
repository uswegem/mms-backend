import { PrismaClient } from '@prisma/client';

const url =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL?.replace(':6543/', ':5432/').replace(
    '?pgbouncer=true',
    '',
  );

const prisma = new PrismaClient({
  datasources: { db: { url } },
});

async function main() {
  const auth = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'users','auth_credentials','refresh_tokens',
        'password_reset_tokens','permissions','roles','audit_logs'
      )
    ORDER BY table_name
  `;
  const all = await prisma.$queryRaw`
    SELECT count(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  console.log('Connected OK.');
  console.log('Auth tables:', auth);
  console.log('Total public tables:', all[0]?.n ?? 0);
}

main()
  .catch((e) => {
    console.error('DB error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
