/**
 * Dev helper: create one ACTIVE merchant with alias + TIPS data,
 * then generate a static TANQR via the API.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_BASE ?? 'http://localhost:3001/api/v1';

/** Damm check digit (same table as Backend shared util). */
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
  const token = data.accessToken ?? data.access_token;
  if (!token) throw new Error(`No token in login response: ${JSON.stringify(data)}`);
  return token;
}

async function main() {
  const acquirer = await prisma.acquirer.findFirst({
    where: { code: 'DEMO', deletedAt: null },
  });
  if (!acquirer) throw new Error('DEMO acquirer not found — run prisma seed first');

  await prisma.acquirer.update({
    where: { id: acquirer.id },
    data: { tipsAcquirerId5: '01044' },
  });
  console.log('✓ DEMO acquirer tipsAcquirerId5 = 01044');

  const admin = await prisma.user.findFirst({
    where: { email: 'admin@mms.local', deletedAt: null },
  });

  let merchant = await prisma.merchant.findFirst({
    where: {
      tradingName: 'YN RESTAURANTS',
      deletedAt: null,
      acquirerId: acquirer.id,
    },
    include: { profile: true, merchantAlias: true },
  });

  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: {
        acquirerId: acquirer.id,
        merchantCode: 'MMS-QR-DEMO-001',
        legalName: 'YN Restaurants Limited',
        tradingName: 'YN RESTAURANTS',
        displayName: 'YN RESTAURANTS',
        status: 'ACTIVE',
        mcc: '5814',
        businessCategory: 'Restaurants',
        contactPerson: 'Demo Merchant',
        activatedAt: new Date(),
        onboardedAt: new Date(),
        createdBy: admin?.id,
        profile: {
          create: {
            city: 'DODOMA',
            region: 'Dodoma',
            countryCode: 'TZ',
            postalCode: '41000',
            addressLine1: '12 Market Street',
            contactPhone: '+255700000001',
            contactEmail: 'yn.restaurants@example.tz',
          },
        },
        kyc: {
          create: {
            status: 'APPROVED',
            submittedAt: new Date(),
          },
        },
        settlementConfig: {
          create: {
            approvalStatus: 'APPROVED',
            payoutCycle: 'DAILY',
            approvedAt: new Date(),
            approvedBy: admin?.id,
            createdBy: admin?.id,
          },
        },
      },
      include: { profile: true, merchantAlias: true },
    });
    console.log('✓ Created merchant YN RESTAURANTS');
  } else {
    merchant = await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        status: 'ACTIVE',
        mcc: '5814',
        tradingName: 'YN RESTAURANTS',
        activatedAt: merchant.activatedAt ?? new Date(),
        profile: {
          upsert: {
            create: {
              city: 'DODOMA',
              region: 'Dodoma',
              countryCode: 'TZ',
              postalCode: '41000',
              addressLine1: '12 Market Street',
            },
            update: {
              city: 'DODOMA',
              postalCode: '41000',
            },
          },
        },
      },
      include: { profile: true, merchantAlias: true },
    });
    console.log('✓ Updated existing merchant to ACTIVE / QR-ready');
  }

  const acquirerCode3 = '781';
  const merchantCode4 = '0001';
  const alias8 = buildEightDigitId(acquirerCode3, merchantCode4);
  const checksum1 = alias8.slice(-1);

  if (!merchant.merchantAlias) {
    await prisma.merchantAlias.create({
      data: {
        merchantId: merchant.id,
        alias8digit: alias8,
        acquirerCode3,
        merchantCode4,
        checksum1,
        isActive: true,
      },
    });
    console.log(`✓ Issued Lipa Namba alias ${alias8}`);
  } else {
    const badBlock = !['781', '782'].includes(merchant.merchantAlias.acquirerCode3);
    await prisma.merchantAlias.update({
      where: { id: merchant.merchantAlias.id },
      data: badBlock
        ? {
            alias8digit: alias8,
            acquirerCode3,
            merchantCode4,
            checksum1,
            isActive: true,
          }
        : { isActive: true },
    });
    console.log(
      badBlock
        ? `✓ Corrected Lipa Namba alias to ${alias8}`
        : `✓ Alias active: ${merchant.merchantAlias.alias8digit}`,
    );
  }

  await prisma.tipsRegistration.upsert({
    where: { merchantId: merchant.id },
    create: {
      merchantId: merchant.id,
      domainName: 'tz.go.bot.tips',
      acquirerId5: '01044',
      merchantId15: alias8.padStart(15, '0'),
      status: 'REGISTERED',
      registeredAt: new Date(),
    },
    update: {
      acquirerId5: '01044',
      merchantId15: alias8.padStart(15, '0'),
      status: 'REGISTERED',
      registeredAt: new Date(),
    },
  });
  console.log('✓ TipsRegistration REGISTERED (acquirer 01044)');

  const token = await login();
  console.log('✓ Logged in as admin@mms.local');

  const qrRes = await fetch(`${API}/merchants/${merchant.id}/qr/static`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ force_regenerate: true }),
  });

  const qrBody = await qrRes.json();
  if (!qrRes.ok) {
    throw new Error(`QR generate failed: ${qrRes.status} ${JSON.stringify(qrBody)}`);
  }

  console.log('\n=== QR-ready merchant created ===');
  console.log(`Merchant ID:   ${merchant.id}`);
  console.log(`Trading name:  YN RESTAURANTS`);
  console.log(`City / postal: DODOMA / 41000`);
  console.log(`MCC:           5814`);
  console.log(`QR ID:         ${qrBody.qr_id}`);
  console.log(`Alias:         ${qrBody.alias}`);
  console.log(`CRC:           ${qrBody.crc}`);
  console.log(`PNG:           http://localhost:3001${qrBody.assets?.png ?? ''}`);
  console.log(`Display PDF:   http://localhost:3001/api/v1/qr/${qrBody.qr_id}/display.pdf`);
  console.log(`TLV payload:\n${qrBody.tlv_payload}`);
  console.log(`\nOpen in UI: http://localhost:3000/merchants/${merchant.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
