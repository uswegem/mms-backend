import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import * as QRCode from 'qrcode';
import { ReferenceResolutionService } from './reference-resolution.service';

@Injectable()
export class ReferenceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolution: ReferenceResolutionService,
  ) {}

  async search(params: {
    merchantId?: string;
    q: string;
  }) {
    const q = this.resolution.normalize(params.q);
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        ...(params.merchantId ? { merchantId: params.merchantId } : {}),
        OR: [
          { paymentReference: { contains: q } },
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        student: { include: { studentAlias: true } },
        merchant: true,
        payments: { include: { allocations: true }, orderBy: { paidAt: 'desc' } },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    const aliases = /^\d{8}$/.test(q)
      ? await this.prisma.studentAlias.findMany({
          where: {
            alias8digit: q,
            ...(params.merchantId ? { merchantId: params.merchantId } : {}),
          },
          include: {
            student: true,
            merchant: true,
          },
          take: 20,
        })
      : [];

    return {
      invoices: invoices.map((inv) => ({
        type: 'INVOICE' as const,
        reference: inv.paymentReference,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        merchantId: inv.merchantId,
        schoolName: inv.merchant.tradingName,
        studentName: inv.student.fullName,
        studentLipa: inv.student.studentAlias?.alias8digit ?? null,
        outstanding: inv.outstandingBalance.toString(),
        payments: inv.payments,
        trail: this.buildInvoiceTrail(inv),
      })),
      students: aliases.map((a) => ({
        type: 'STUDENT' as const,
        reference: a.alias8digit,
        merchantId: a.merchantId,
        schoolName: a.merchant.tradingName,
        studentId: a.studentId,
        studentName: a.student.fullName,
      })),
    };
  }

  async trail(merchantId: string | undefined, reference: string) {
    const normalized = this.resolution.normalize(reference);
    const lookups = await this.prisma.referenceLookupLog.findMany({
      where: {
        reference: normalized,
        ...(merchantId ? { merchantId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const payments = await this.prisma.feePayment.findMany({
      where: {
        paymentReference: normalized,
        ...(merchantId ? { merchantId } : {}),
      },
      include: { allocations: true },
      orderBy: { createdAt: 'asc' },
    });
    const invoice = await this.prisma.feeInvoice.findFirst({
      where: {
        paymentReference: normalized,
        ...(merchantId ? { merchantId } : {}),
      },
    });
    return {
      reference: normalized,
      invoice,
      lookups,
      payments,
      lifecycle: invoice
        ? invoice.status === 'CANCELLED'
          ? 'cancelled'
          : invoice.status === 'PAID'
            ? 'settled'
            : 'active'
        : null,
    };
  }

  async renderPaymentSlipPdf(merchantId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.feeInvoice.findFirst({
      where: { id: invoiceId, merchantId },
      include: {
        student: { include: { studentAlias: true } },
        merchant: { include: { school: true } },
        lines: true,
        academicTerm: { include: { academicYear: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    let qrPng: Buffer | null = null;
    try {
      qrPng = await QRCode.toBuffer(invoice.paymentReference, {
        type: 'png',
        width: 180,
        margin: 1,
      });
    } catch {
      qrPng = null;
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text(invoice.merchant.tradingName, { align: 'left' });
      doc.fontSize(10).fillColor('#555').text('School Fee Payment Slip', { align: 'left' });
      doc.moveDown();
      doc.fillColor('#000').fontSize(11);
      doc.text(`Invoice: ${invoice.invoiceNumber}`);
      doc.text(`Control No: ${invoice.paymentReference}`);
      doc.text(
        `Student: ${invoice.student.fullName} (${invoice.student.admissionNo})`,
      );
      if (invoice.student.studentAlias) {
        doc.text(`Student Lipa Namba: ${invoice.student.studentAlias.alias8digit}`);
      }
      doc.text(
        `Term: ${invoice.academicTerm.academicYear.name} / ${invoice.academicTerm.name}`,
      );
      doc.text(`Status: ${invoice.status}`);
      doc.moveDown();
      doc.text('Fee items:');
      for (const line of invoice.lines) {
        doc.text(`  • ${line.name}: TZS ${line.amount.toFixed(2)}`);
      }
      doc.moveDown();
      doc.text(`Total: TZS ${invoice.totalAmount.toFixed(2)}`);
      doc.text(`Paid: TZS ${invoice.amountPaid.toFixed(2)}`);
      doc.text(`Outstanding: TZS ${invoice.outstandingBalance.toFixed(2)}`);
      if (qrPng) {
        doc.moveDown();
        doc.text('Scan / enter control number:');
        doc.image(qrPng, { width: 120 });
      }
      doc.end();
    });
  }

  private buildInvoiceTrail(inv: {
    createdAt: Date;
    status: string;
    cancelledAt: Date | null;
    payments: Array<{ paidAt: Date | null; amount: { toString(): string }; status: string }>;
  }) {
    const events: Array<{ at: string; event: string; detail?: string }> = [
      { at: inv.createdAt.toISOString(), event: 'issued' },
    ];
    for (const p of inv.payments) {
      events.push({
        at: (p.paidAt ?? new Date()).toISOString(),
        event: 'paid',
        detail: `${p.status} ${p.amount.toString()}`,
      });
    }
    if (inv.cancelledAt) {
      events.push({ at: inv.cancelledAt.toISOString(), event: 'cancelled' });
    }
    if (inv.status === 'PAID') {
      events.push({ at: new Date().toISOString(), event: 'settled' });
    }
    return events;
  }
}
