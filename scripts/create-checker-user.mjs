/**
 * Dev helper: create BANK_ADMIN checker user for maker-checker onboarding approvals.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const EMAIL = process.env.CHECKER_EMAIL ?? 'checker@mms.local';
const PASSWORD = process.env.CHECKER_PASSWORD ?? 'Checker@12345678';

const prisma = new PrismaClient();

async function main() {
  const acquirer = await prisma.acquirer.findFirst({ where: { code: 'DEMO' } });
  if (!acquirer) throw new Error('DEMO acquirer missing — run prisma seed first');

  const role = await prisma.role.findFirst({
    where: { acquirerId: acquirer.id, code: 'BANK_ADMIN' },
  });
  if (!role) throw new Error('BANK_ADMIN role missing');

  let user = await prisma.user.findFirst({ where: { email: EMAIL, deletedAt: null } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        acquirerId: acquirer.id,
        email: EMAIL,
        fullName: 'Bank Checker',
        status: 'ACTIVE',
      },
    });
  } else {
    user = await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
  }

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await prisma.authCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash },
    create: { userId: user.id, passwordHash },
  });

  const existingRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: role.id },
  });
  if (!existingRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        scopeType: 'ACQUIRER',
        scopeId: acquirer.id,
      },
    });
  }

  console.log('Checker account ready');
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log('  Role:     BANK_ADMIN');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
