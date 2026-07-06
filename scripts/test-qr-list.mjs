import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const merchantId = process.argv[2];

async function main() {
  try {
    const merchant = await p.merchant.findUnique({
      where: { id: merchantId },
      include: {
        profile: true,
        merchantAlias: true,
        kyc: true,
        settlementConfig: true,
        integrations: { where: { integrationType: 'TPS' }, take: 1 },
        tipsRegistration: true,
      },
    });
    console.log('merchant ok', merchant?.tradingName);
  } catch (e) {
    console.error('merchant query failed:', e.message);
  }

  try {
    const rows = await p.qrCode.findMany({
      where: { merchantId },
      include: {
        payloadVersions: { orderBy: { version: 'desc' }, take: 1 },
        student: true,
      },
    });
    console.log('qr rows', rows.length);
    if (rows[0]?.payloadVersions[0]) {
      console.log('payload version fields', Object.keys(rows[0].payloadVersions[0]));
    }
  } catch (e) {
    console.error('qr query failed:', e.message);
  }
}

main().finally(() => p.$disconnect());
