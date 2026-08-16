import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { QrService } from '@modules/qr/application/services/qr.service';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { computeAdjustment, money } from '../../domain/fee-money.util';
import { ReferenceService } from './reference.service';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly qr: QrService,
    private readonly references: ReferenceService,
  ) {}

  async generateForStudent(merchantId: string, studentId: string, academicTermId: string, actorId?: string, actor?: ActorContext) {
    const existing = await this.prisma.feeInvoice.findFirst({ where: { merchantId, studentId, academicTermId } });
    if (existing) return existing;
    const enrollment = await this.prisma.studentEnrollment.findFirst({ where: { merchantId, studentId, isCurrent: true } });
    if (!enrollment) throw new BadRequestException('Student has no current enrollment');
    const structure = await this.prisma.feeStructure.findFirst({ where: { merchantId, academicTermId, classLevelId: enrollment.classLevelId, status: 'PUBLISHED' }, include: { items: true } });
    if (!structure) throw new BadRequestException('No published fee structure for student class and term');
    const invoice = await this.prisma.$transaction(async (tx) => {
      const { invoiceNumber, paymentReference } = await this.references.nextInvoiceIdentifiers(
        merchantId,
        academicTermId,
        tx,
      );
      const subtotal = structure.items.reduce((sum, item) => sum.plus(item.amount), money(0));
      const dueDate = structure.items.reduce<Date | null>((latest, item) => !item.dueDate || (latest && latest >= item.dueDate) ? latest : item.dueDate, null);
      return tx.feeInvoice.create({
        data: {
          merchantId,
          studentId,
          feeStructureId: structure.id,
          academicTermId,
          classLevelId: enrollment.classLevelId,
          invoiceNumber,
          paymentReference,
          subtotalAmount: subtotal,
          totalAmount: subtotal,
          outstandingBalance: subtotal,
          dueDate: dueDate ?? undefined,
          createdBy: actorId,
          lines: {
            create: structure.items.map((item) => ({
              feeStructureItemId: item.id,
              code: item.code,
              name: item.name,
              amount: item.amount,
              isMandatory: item.isMandatory,
              dueDate: item.dueDate,
            })),
          },
        },
        include: { lines: true },
      });
    });
    await this.audit.record({
      actorId: actorId ?? null,
      action: 'FEE_INVOICE_CREATED',
      entityType: 'fee_invoice',
      entityId: invoice.id,
      metadata: {
        merchantId,
        invoiceNumber: invoice.invoiceNumber,
        paymentReference: invoice.paymentReference,
      },
    });
    if (actor) await this.tryCreateQr(invoice.id, merchantId, actor);
    await this.notifyHooks(invoice.id, 'created');
    return invoice;
  }

  async generateForClass(merchantId: string, classLevelId: string, academicTermId: string, actorId?: string, actor?: ActorContext) {
    const enrollments = await this.prisma.studentEnrollment.findMany({ where: { merchantId, classLevelId, isCurrent: true, student: { isActive: true } } });
    const result = await Promise.allSettled(enrollments.map((e) => this.generateForStudent(merchantId, e.studentId, academicTermId, actorId, actor)));
    return { requested: enrollments.length, generated: result.filter((r) => r.status === 'fulfilled').length, errors: result.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error') };
  }

  async cancel(merchantId: string, invoiceId: string, reason: string, actorId?: string) {
    const invoice = await this.owned(merchantId, invoiceId);
    if (invoice.amountPaid.gt(0)) throw new BadRequestException('Paid invoices cannot be cancelled');
    const result = await this.prisma.feeInvoice.update({ where: { id: invoiceId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: actorId, cancelReason: reason, outstandingBalance: money(0) } });
    await this.audit.record({ actorId: actorId ?? null, action: 'FEE_INVOICE_CANCELLED', entityType: 'fee_invoice', entityId: invoiceId, metadata: { reason } });
    return result;
  }

  async applyAdjustment(merchantId: string, invoiceId: string, input: { type: 'DISCOUNT' | 'WAIVER' | 'SCHOLARSHIP'; reason: string; amountOff?: string; percentOff?: string; invoiceLineId?: string }, actorId?: string) {
    await this.owned(merchantId, invoiceId);
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true, adjustments: true } });
      if (invoice.status === 'CANCELLED') throw new BadRequestException('Cancelled invoices cannot be adjusted');
      const base = input.invoiceLineId ? invoice.lines.find((line) => line.id === input.invoiceLineId)?.amount : invoice.subtotalAmount;
      if (!base) throw new BadRequestException('Invoice line not found');
      const amountOff = computeAdjustment(base, input.amountOff, input.percentOff);
      const adjustment = await tx.feeInvoiceAdjustment.create({ data: { invoiceId, invoiceLineId: input.invoiceLineId, type: input.type, reason: input.reason, amountOff, percentOff: input.percentOff ? money(input.percentOff) : undefined, createdBy: actorId } });
      const totalAdjustment = invoice.adjustments.reduce((sum, a) => sum.plus(a.amountOff), amountOff);
      const total = Prisma.Decimal.max(money(0), invoice.subtotalAmount.minus(totalAdjustment));
      await tx.feeInvoice.update({ where: { id: invoiceId }, data: { adjustmentAmount: totalAdjustment, totalAmount: total, outstandingBalance: Prisma.Decimal.max(money(0), total.minus(invoice.amountPaid)), status: invoice.amountPaid.gte(total) ? 'PAID' : invoice.amountPaid.gt(0) ? 'PARTIALLY_PAID' : 'UNPAID' } });
      await this.audit.record({ actorId: actorId ?? null, action: 'FEE_INVOICE_ADJUSTED', entityType: 'fee_invoice', entityId: invoiceId, metadata: { amountOff: amountOff.toString() } });
      return adjustment;
    });
  }

  list(merchantId: string, filters: { classLevelId?: string; academicTermId?: string; status?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'; search?: string } = {}) {
    const search = filters.search?.trim();
    return this.prisma.feeInvoice.findMany({
      where: {
        merchantId,
        classLevelId: filters.classLevelId,
        academicTermId: filters.academicTermId,
        status: filters.status,
        ...(search
          ? {
              OR: [
                { invoiceNumber: { contains: search, mode: 'insensitive' } },
                { paymentReference: { contains: search } },
                { student: { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { admissionNo: { contains: search, mode: 'insensitive' } }] } },
              ],
            }
          : {}),
      },
      include: { student: true, academicTerm: true, classLevel: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async detail(merchantId: string, invoiceId: string) { await this.owned(merchantId, invoiceId); return this.prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { student: true, lines: true, payments: true, adjustments: true } }); }
  studentStatement(merchantId: string, studentId: string) {
    return this.prisma.feeInvoice.findMany({
      where: { merchantId, studentId },
      include: { payments: true, academicTerm: true, adjustments: true, lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async classTermTotals(merchantId: string, classLevelId: string, academicTermId: string) { const result = await this.prisma.feeInvoice.aggregate({ where: { merchantId, classLevelId, academicTermId, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true, amountPaid: true, outstandingBalance: true }, _count: true }); return { invoiceCount: result._count, total: money(result._sum.totalAmount ?? 0), collected: money(result._sum.amountPaid ?? 0), outstanding: money(result._sum.outstandingBalance ?? 0) }; }
  refreshOverdueFlags(merchantId: string) { return this.prisma.feeInvoice.updateMany({ where: { merchantId, dueDate: { lt: new Date() }, outstandingBalance: { gt: money(0) }, status: { not: 'CANCELLED' } }, data: { isOverdue: true } }); }
  async notifyHooks(_invoiceId: string, _event: 'created' | 'paid') { /* notification integration hook */ }
  private async owned(merchantId: string, id: string) { const invoice = await this.prisma.feeInvoice.findFirst({ where: { id, merchantId } }); if (!invoice) throw new NotFoundException('Invoice not found'); return invoice; }
  private async tryCreateQr(invoiceId: string, merchantId: string, actor: ActorContext) {
    try {
      const invoice = await this.prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const qr = await this.qr.generateDynamic(merchantId, actor, {
        amount: invoice.outstandingBalance.toString(),
        billNumber: invoice.paymentReference,
        referenceLabel: invoice.paymentReference,
        expiresInMinutes: 60 * 24 * 90,
      });
      await this.prisma.feeInvoice.update({ where: { id: invoiceId }, data: { qrCodeId: qr.qr_id } });
    } catch {
      /* QR failure must not fail invoice issuance */
    }
  }
}
