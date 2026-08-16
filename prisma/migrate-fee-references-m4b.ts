/**
 * Regenerate 4(a) legacy INV-/REF- invoice identifiers into M4(b) formats.
 * Never reuses a control number. Updates linked QR bill_number when present.
 *
 * Usage: npx ts-node --transpile-only prisma/migrate-fee-references-m4b.ts
 */
import { PrismaClient } from '@prisma/client';
import { appendDammCheckDigit } from '../src/shared/domain/alias/damm.util';

const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.feeInvoice.findMany({
    include: {
      academicTerm: { include: { academicYear: true } },
      merchant: { include: { schoolSequence: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const mappings: Array<{ id: string; oldRef: string; newRef: string; oldInv: string; newInv: string }> = [];

  for (const inv of invoices) {
    const schoolSeq = inv.merchant.schoolSequence?.schoolSeq3;
    if (!schoolSeq) {
      console.warn(`Skip ${inv.id}: missing schoolSeq3`);
      continue;
    }
    const alreadyNew =
      /^\d{13}$/.test(inv.paymentReference) && inv.paymentReference.startsWith('9');
    if (alreadyNew && inv.invoiceNumber.startsWith(`INV-${schoolSeq}-`)) {
      continue;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO fee_invoice_sequences (merchant_id, last_invoice, last_reference, updated_at)
       VALUES ($1::uuid, 0, 0, NOW())
       ON CONFLICT (merchant_id) DO NOTHING`,
      inv.merchantId,
    );

    const seq = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT merchant_id FROM fee_invoice_sequences WHERE merchant_id = $1::uuid FOR UPDATE`,
        inv.merchantId,
      );
      return tx.feeInvoiceSequence.update({
        where: { merchantId: inv.merchantId },
        data: {
          lastInvoice: { increment: 1 },
          lastReference: { increment: 1 },
        },
      });
    });

    const year =
      inv.academicTerm.academicYear.name.match(/\d{4}/)?.[0] ??
      String(new Date().getFullYear());
    const termSeq = String(Math.min(9, Math.max(1, inv.academicTerm.sequence)));
    const invoiceNumber = `INV-${schoolSeq}-${year}${termSeq}-${seq.lastInvoice.toString().padStart(6, '0')}`;
    const body = `9${schoolSeq}${seq.lastReference.toString().padStart(8, '0').slice(-8)}`;
    const paymentReference = appendDammCheckDigit(body);

    const oldRef = inv.paymentReference;
    const oldInv = inv.invoiceNumber;

    await prisma.feeInvoice.update({
      where: { id: inv.id },
      data: { invoiceNumber, paymentReference },
    });

    await prisma.feePayment.updateMany({
      where: { paymentReference: oldRef },
      data: { paymentReference },
    });

    if (inv.qrCodeId) {
      await prisma.qrPayloadVersion.updateMany({
        where: { qrId: inv.qrCodeId },
        data: {
          billNumber: paymentReference,
          referenceLabel: paymentReference,
        },
      });
    }

    mappings.push({
      id: inv.id,
      oldRef,
      newRef: paymentReference,
      oldInv,
      newInv: invoiceNumber,
    });
  }

  console.log(JSON.stringify({ migrated: mappings.length, mappings }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
