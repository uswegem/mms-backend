/**
 * Create or reactivate a test user with a given role.
 * Usage:
 *   node scripts/ensure-test-user.mjs ops@mms.local Ops@12345678 OPERATIONS_USER "Operations Maker"
 *   node scripts/ensure-test-user.mjs checker@mms.local Checker@12345678 BANK_ADMIN "Bank Checker"
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const [email, password, roleCode, fullName] = process.argv.slice(2);
if (!email || !password || !roleCode) {
  console.error(
    'Usage: node scripts/ensure-test-user.mjs <email> <password> <ROLE_CODE> [fullName]',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const acquirer = await prisma.acquirer.findFirst({ where: { code: 'DEMO' } });
  if (!acquirer) throw new Error('DEMO acquirer missing');

  const role = await prisma.role.findFirst({
    where: { acquirerId: acquirer.id, code: roleCode },
  });
  if (!role) throw new Error(`Role not found: ${roleCode}`);

  let user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        acquirerId: acquirer.id,
        email,
        fullName: fullName ?? roleCode,
        status: 'ACTIVE',
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'ACTIVE',
        deletedAt: null,
        deletedBy: null,
        fullName: fullName ?? user.fullName,
      },
    });
  }

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.authCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash },
    create: { userId: user.id, passwordHash },
  });

  const hasRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: role.id },
  });
  if (!hasRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        scopeType: 'ACQUIRER',
        scopeId: acquirer.id,
      },
    });
  }

  console.log('✓ User ready');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     ${roleCode}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
