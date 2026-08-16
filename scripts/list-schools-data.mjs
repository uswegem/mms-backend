/** List active schools with fee data counts. Usage: node scripts/list-schools-data.mjs [emailToBind] */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const [emailToBind] = process.argv.slice(2);

async function main() {
  const schools = await prisma.merchant.findMany({
    where: { isSchool: true, status: 'ACTIVE', deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  let best = null;
  let bestScore = -1;
  for (const s of schools) {
    const [students, invoices, payments] = await Promise.all([
      prisma.student.count({ where: { merchantId: s.id } }),
      prisma.feeInvoice.count({ where: { merchantId: s.id } }),
      prisma.feePayment.count({ where: { merchantId: s.id } }),
    ]);
    console.log(`${s.tradingName} (${s.id}) — students:${students} invoices:${invoices} payments:${payments}`);
    const score = students + invoices * 2 + payments * 3;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (emailToBind && best) {
    const user = await prisma.user.findFirst({ where: { email: emailToBind } });
    if (!user) throw new Error(`User not found: ${emailToBind}`);
    await prisma.user.update({ where: { id: user.id }, data: { merchantId: best.id } });
    console.log(`\n✓ ${emailToBind} bound to "${best.tradingName}" (${best.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
