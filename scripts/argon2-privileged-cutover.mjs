// One-time Argon2id migration cutover script (brief §1.3).
//
// Flags every still-BCRYPT user holding a privileged role, or a permission
// ending in ":approve" (maker-checker approvers), with mustResetPassword so
// their next login routes to forced reset instead of a normal session.
//
// Usage:
//   node scripts/argon2-privileged-cutover.mjs            # dry run — lists affected users only
//   node scripts/argon2-privileged-cutover.mjs --apply     # flags them + sends the notice email
//
// Run once, right when the Argon2id code ships (see ARGON2_MIGRATION_START_DATE
// in .env — this script and that date should be set together). Safe to re-run:
// findMany filters on mustResetPassword: false, so already-flagged users are
// skipped, not re-notified.

import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';

const directUrl = process.env.DIRECT_DATABASE_URL;
if (!directUrl) {
  console.error('DIRECT_DATABASE_URL is required');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const privilegedRoleCodes = (
  process.env.AUTH_PRIVILEGED_ROLE_CODES ?? 'SUPER_ADMIN,BANK_ADMIN'
)
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);

const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });

function buildTransport() {
  const host = process.env.MAIL_HOST;
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  if (process.env.MAIL_ENABLED !== 'true' || !host || !user || !pass) {
    console.warn(
      'MAIL_ENABLED/SMTP settings incomplete — notification emails will be skipped.',
    );
    return null;
  }
  return nodemailer.createTransport({
    host,
    port: Number(process.env.MAIL_PORT ?? 587),
    secure: process.env.MAIL_SECURE === 'true',
    auth: { user, pass },
  });
}

async function notify(transport, user) {
  if (!transport) return false;
  const loginUrl = `${process.env.CORS_ORIGIN ?? ''}/login`;
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? 'MMS <noreply@mms.local>',
    to: user.email,
    subject: 'Action required: reset your MMS password',
    text: [
      `Hello ${user.fullName},`,
      '',
      'MMS is upgrading how account passwords are protected. Because your ' +
        'account can approve sensitive actions, you need to set a new ' +
        'password before you can sign in again.',
      '',
      `Next time you sign in at ${loginUrl}, use "Forgot password" to set a ` +
        'new one — your account will not accept your current password ' +
        'until you do.',
      '',
      'If you were not expecting this, contact your MMS administrator.',
    ].join('\n'),
  });
  return true;
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      authCredential: { passwordAlgo: 'BCRYPT', mustResetPassword: false },
      userRoles: {
        some: {
          role: {
            OR: [
              { code: { in: privilegedRoleCodes } },
              {
                permissions: {
                  some: { permission: { code: { endsWith: ':approve' } } },
                },
              },
            ],
          },
        },
      },
    },
    select: { id: true, email: true, fullName: true },
  });

  console.log(
    `Found ${users.length} privileged user(s) still on BCRYPT` +
      ` (privileged role codes: ${privilegedRoleCodes.join(', ')}, or any :approve permission).`,
  );
  for (const u of users) console.log(`  - ${u.email} (${u.fullName})`);

  if (!apply) {
    console.log('\nDry run — pass --apply to flag these accounts and send notices.');
    return;
  }

  const transport = buildTransport();
  let notified = 0;
  for (const u of users) {
    await prisma.authCredential.update({
      where: { userId: u.id },
      data: { mustResetPassword: true },
    });
    if (await notify(transport, u)) notified += 1;
  }
  console.log(`\nFlagged ${users.length} user(s); sent ${notified} notice email(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
