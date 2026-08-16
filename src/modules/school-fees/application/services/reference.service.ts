import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { appendDammCheckDigit } from '@shared/domain/alias/damm.util';

export const INVOICE_CONTROL_PREFIX = '9';

type Tx = Prisma.TransactionClient;

/**
 * Centralized immutable reference generation for school fees (M4b).
 * Invoice control: 9 + schoolSeq3 + seq8 + Damm = 13 digits.
 * Invoice number: INV-{schoolSeq3}-{YYYY}{termSeq}-{seq6}
 * Student payer reference: existing Lipa Namba (8-digit Damm) — not generated here.
 */
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async nextInvoiceIdentifiers(
    merchantId: string,
    academicTermId: string,
    tx?: Tx,
  ): Promise<{ invoiceNumber: string; paymentReference: string }> {
    const run = async (client: Tx) => {
      const schoolSeq = await this.requireSchoolSeq3(merchantId, client);
      const term = await client.academicTerm.findFirst({
        where: { id: academicTermId, merchantId },
        include: { academicYear: true },
      });
      if (!term) {
        throw new ConflictException('Academic term not found for reference generation');
      }

      await client.$executeRaw(
        Prisma.sql`INSERT INTO fee_invoice_sequences (merchant_id, last_invoice, last_reference, updated_at)
          VALUES (${merchantId}::uuid, 0, 0, NOW())
          ON CONFLICT (merchant_id) DO NOTHING`,
      );
      await client.$queryRaw(
        Prisma.sql`SELECT merchant_id FROM fee_invoice_sequences WHERE merchant_id = ${merchantId}::uuid FOR UPDATE`,
      );
      const seq = await client.feeInvoiceSequence.update({
        where: { merchantId },
        data: {
          lastInvoice: { increment: 1 },
          lastReference: { increment: 1 },
        },
      });

      const year = (term.academicYear.name.match(/\d{4}/)?.[0] ?? new Date().getFullYear().toString()).slice(0, 4);
      const termSeq = String(Math.min(9, Math.max(1, term.sequence))).slice(0, 1);
      const invoiceNumber = `INV-${schoolSeq}-${year}${termSeq}-${seq.lastInvoice.toString().padStart(6, '0')}`;
      const paymentReference = this.buildInvoiceControlNumber(schoolSeq, seq.lastReference);

      return { invoiceNumber, paymentReference };
    };

    if (tx) return run(tx);
    return this.prisma.$transaction((client) => run(client));
  }

  buildInvoiceControlNumber(schoolSeq3: string, sequence: number): string {
    const seq8 = sequence.toString().padStart(8, '0').slice(-8);
    const body = `${INVOICE_CONTROL_PREFIX}${schoolSeq3}${seq8}`;
    return appendDammCheckDigit(body);
  }

  isInvoiceControlFormat(reference: string): boolean {
    return /^\d{13}$/.test(reference) && reference.startsWith(INVOICE_CONTROL_PREFIX);
  }

  isStudentReferenceFormat(reference: string): boolean {
    return /^\d{8}$/.test(reference);
  }

  private async requireSchoolSeq3(merchantId: string, client: Tx): Promise<string> {
    const row = await client.schoolSequence.findUnique({ where: { merchantId } });
    if (!row?.schoolSeq3) {
      throw new ConflictException(
        'School sequence (schoolSeq3) missing — school Lipa issuance must complete before fee references',
      );
    }
    return row.schoolSeq3;
  }
}
