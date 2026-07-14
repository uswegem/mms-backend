/**
 * Fix Acquirer ID (01044) and Lipa Namba blocks (780 school / 781-782 merchant),
 * then regenerate static QR payloads.
 *
 * Usage: node scripts/fix-acquirer-lipa-blocks.mjs
 */
import { PrismaClient } from '@prisma/client';

const DAMM_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 8, 7, 6, 5, 4, 0, 9, 1, 2],
  [7, 6, 5, 4, 3, 2, 1, 0, 9, 8],
  [8, 7, 6, 5, 4, 3, 2, 1, 0, 9],
  [9, 5, 6, 7, 8, 1, 2, 3, 4, 0],
];

const API = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const ACQUIRER_ID5 = '01044';

function dammCheckDigit(digits) {
  let interim = 0;
  for (const d of digits) interim = DAMM_TABLE[interim][d];
  for (let i = 0; i <= 9; i++) if (DAMM_TABLE[interim][i] === 0) return i;
  return 0;
}

function buildEightDigitId(prefix, sequence) {
  const body = `${prefix}${sequence}`.padStart(7, '0').slice(-7);
  const digits = body.split('').map((c) => parseInt(c, 10));
  return `${body}${dammCheckDigit(digits)}`;
}

function expectedBlock(isSchool) {
  return isSchool ? '780' : '781';
}

function isValidBlock(alias, isSchool) {
  const block = alias?.slice(0, 3);
  if (isSchool) return block === '780';
  return block === '781' || block === '782';
}

async function nextSeq4(tx, block) {
  const row = await tx.globalAliasSequence.upsert({
    where: { id: `BLOCK_${block}` },
    update: { lastSeq: { increment: 1 } },
    create: { id: `BLOCK_${block}`, lastSeq: 1 },
  });
  return {
    seq4: row.lastSeq.toString().padStart(4, '0'),
    alias8digit: buildEightDigitId(block, row.lastSeq.toString().padStart(4, '0')),
  };
}

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@mms.local',
      password: 'Admin@12345678',
    }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.accessToken ?? data.access_token;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const updated = await prisma.acquirer.updateMany({
      where: { deletedAt: null },
      data: { tipsAcquirerId5: ACQUIRER_ID5 },
    });
    console.log(`✓ Set tipsAcquirerId5=${ACQUIRER_ID5} on ${updated.count} acquirer(s)`);

    await prisma.tipsRegistration.updateMany({
      data: { acquirerId5: ACQUIRER_ID5 },
    });
    console.log('✓ Updated tips_registrations.acquirer_id_5');

    const merchants = await prisma.merchant.findMany({
      where: { deletedAt: null },
      include: { merchantAlias: true },
    });

    for (const merchant of merchants) {
      const alias = merchant.merchantAlias;
      if (!alias) continue;
      if (isValidBlock(alias.alias8digit, merchant.isSchool)) {
        console.log(`• ${merchant.tradingName}: alias ${alias.alias8digit} OK`);
        continue;
      }

      const block = expectedBlock(merchant.isSchool);
      const issued = await prisma.$transaction(async (tx) => {
        const { seq4, alias8digit } = await nextSeq4(tx, block);
        return tx.merchantAlias.update({
          where: { id: alias.id },
          data: {
            alias8digit,
            acquirerCode3: block,
            merchantCode4: seq4,
            checksum1: alias8digit[7],
            isActive: true,
          },
        });
      });
      console.log(
        `✓ ${merchant.tradingName}: ${alias.alias8digit} → ${issued.alias8digit} (block ${block})`,
      );
    }

    const token = await login();
    const withAlias = await prisma.merchant.findMany({
      where: { deletedAt: null, status: 'ACTIVE', merchantAlias: { isNot: null } },
      select: { id: true, tradingName: true, merchantAlias: true },
    });

    for (const merchant of withAlias) {
      const res = await fetch(`${API}/merchants/${merchant.id}/qr/static`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force_regenerate: true }),
      });
      const body = await res.json();
      if (!res.ok) {
        console.warn(`⚠ QR regenerate failed for ${merchant.tradingName}: ${JSON.stringify(body)}`);
        continue;
      }
      console.log(
        `✓ QR regenerated for ${merchant.tradingName}: alias=${body.alias} acquirer tag has ${ACQUIRER_ID5}`,
      );
      console.log(`  payload: ${body.tlv_payload}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
