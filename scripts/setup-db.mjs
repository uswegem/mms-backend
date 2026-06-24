import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const directUrl = process.env.DIRECT_DATABASE_URL;
if (!directUrl) {
  console.error('DIRECT_DATABASE_URL is required');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: directUrl } },
});

async function runExtensions() {
  const sql = readFileSync('prisma/sql/00-extensions.sql', 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log('Extensions ready (pgcrypto, citext)');
}

async function main() {
  await runExtensions();
  await prisma.$disconnect();
  execSync('npx prisma db push --accept-data-loss', {
    stdio: 'inherit',
    env: process.env,
  });
  execSync('npm run db:seed', { stdio: 'inherit', env: process.env });
  console.log('Database setup complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
