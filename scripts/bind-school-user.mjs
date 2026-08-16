/**
 * Bind a user to the first active demo school merchant (school-scoped access).
 * Usage: node scripts/bind-school-user.mjs school@mms.local
 */
import { PrismaClient } from '@prisma/client';

const [email] = process.argv.slice(2);
if (!email) {
  console.error('Usage: node scripts/bind-school-user.mjs <email>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const school = await prisma.merchant.findFirst({
    where: { isSchool: true, status: 'ACTIVE', deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!school) throw new Error('No active school merchant found — run seed-school-fees.ts first');

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`User not found: ${email}`);

  await prisma.user.update({
    where: { id: user.id },
    data: { merchantId: school.id },
  });

  console.log(`✓ ${email} bound to school "${school.tradingName}" (${school.id})`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
