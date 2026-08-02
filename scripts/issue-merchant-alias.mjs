/**
 * Dev helper: issue Lipa Namba alias for an ACTIVE merchant missing one.
 * Usage: node scripts/issue-merchant-alias.mjs <merchantId>
 *
 * Blocks: 780 = schools, 781/782 = other merchants
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

async function nextSeq4(tx, block) {
  const row = await tx.globalAliasSequence.upsert({
    where: { id: `BLOCK_${block}` },
    update: { lastSeq: { increment: 1 } },
    create: { id: `BLOCK_${block}`, lastSeq: 1 },
  });
  if (row.lastSeq > 9999) throw new Error(`Block ${block} exhausted`);
  return row.lastSeq.toString().padStart(4, '0');
}

async function resolveMerchantBlock(tx) {
  const primary = await tx.globalAliasSequence.findUnique({
    where: { id: 'BLOCK_781' },
  });
  if (!primary || primary.lastSeq < 9999) return '781';
  return '782';
}

async function main() {
  const merchantId = process.argv[2];
  if (!merchantId) {
    console.error('Usage: node scripts/issue-merchant-alias.mjs <merchantId>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { merchantAlias: true },
    });
    if (!merchant) throw new Error(`Merchant not found: ${merchantId}`);
    if (merchant.merchantAlias) {
      console.log(`Merchant already has alias: ${merchant.merchantAlias.alias8digit}`);
      return;
    }

    const alias = await prisma.$transaction(async (tx) => {
      const block = merchant.isSchool ? '780' : await resolveMerchantBlock(tx);
      const seq4 = await nextSeq4(tx, block);
      const alias8digit = buildEightDigitId(block, seq4);
      return tx.merchantAlias.create({
        data: {
          merchantId,
          alias8digit,
          acquirerCode3: block,
          merchantCode4: seq4,
          checksum1: alias8digit[7],
        },
      });
    });

    console.log(
      `✓ Issued Lipa Namba ${alias.alias8digit} (block ${alias.acquirerCode3}) for ${merchant.tradingName}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
