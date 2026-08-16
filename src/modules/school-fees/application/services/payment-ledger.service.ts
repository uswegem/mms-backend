import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FeeInvoiceStatus, FeePaymentRecordStatus, Prisma } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { money } from '../../domain/fee-money.util';
import { assertTransition } from '../../domain/payment-lifecycle';

@Injectable()
export class PaymentLedgerService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async listPayments(filters: { merchantId?: string; status?: FeePaymentRecordStatus; dateFrom?: Date; dateTo?: Date; page?: number; pageSize?: number }) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
    const where: Prisma.FeePaymentWhereInput = {
      merchantId: filters.merchantId,
      status: filters.status,
      gatewayPaidAt: filters.dateFrom || filters.dateTo ? { gte: filters.dateFrom, lte: filters.dateTo } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.feePayment.findMany({ where, include: { invoice: true, allocations: { include: { invoice: true } }, reversals: true }, orderBy: { mmsReceivedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.feePayment.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getPaymentDetail(id: string) {
    const payment = await this.prisma.feePayment.findUnique({
      where: { id }, include: { invoice: true, allocations: { include: { invoice: true } }, reversals: true, lifecycleEvents: { orderBy: { createdAt: 'asc' } }, reconciliationMatches: true },
    });
    if (!payment) throw new NotFoundException('Fee payment not found');
    return payment;
  }

  async dailySummary(merchantId: string, date: Date) {
    const { start, end } = this.dayBounds(date);
    const payments = await this.prisma.feePayment.findMany({
      where: { merchantId, status: FeePaymentRecordStatus.COMPLETED, gatewayPaidAt: { gte: start, lt: end } },
      select: { amount: true, channel: true },
    });
    return {
      merchantId, date: start, paymentCount: payments.length,
      totalCollected: payments.reduce((sum, p) => sum.plus(p.amount), money(0)).toFixed(2),
      byChannel: payments.reduce<Record<string, string>>((out, p) => {
        out[p.channel] = money(out[p.channel] ?? 0).plus(p.amount).toFixed(2); return out;
      }, {}),
    };
  }

  async reversePayment(paymentId: string, reason: string, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.feePayment.findUnique({ where: { id: paymentId }, include: { allocations: true } });
      if (!payment) throw new NotFoundException('Fee payment not found');
      if (payment.status !== FeePaymentRecordStatus.COMPLETED) throw new BadRequestException('Only completed payments can be reversed');
      assertTransition(payment.status, FeePaymentRecordStatus.REVERSED);
      for (const allocation of payment.allocations) {
        const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: allocation.invoiceId } });
        const amountPaid = Prisma.Decimal.max(money(0), money(invoice.amountPaid).minus(allocation.amount));
        const outstandingBalance = money(invoice.totalAmount).minus(amountPaid);
        await tx.feeInvoice.update({ where: { id: invoice.id }, data: {
          amountPaid, outstandingBalance,
          status: amountPaid.lte(0) ? FeeInvoiceStatus.UNPAID : FeeInvoiceStatus.PARTIALLY_PAID,
          isOverdue: outstandingBalance.gt(0) && !!invoice.dueDate && invoice.dueDate < new Date(),
        } });
      }
      await tx.feePaymentReversal.create({ data: { feePaymentId: payment.id, merchantId: payment.merchantId, amount: payment.amount, reason, actorId } });
      const updated = await tx.feePayment.update({ where: { id: payment.id }, data: { status: FeePaymentRecordStatus.REVERSED } });
      await tx.feePaymentLifecycleEvent.create({ data: { feePaymentId: payment.id, fromStatus: payment.status, toStatus: FeePaymentRecordStatus.REVERSED, reason, actorId } });
      return updated;
    });
    await this.audit.record({ actorId, action: 'FEE_PAYMENT_REVERSED', entityType: 'fee_payment', entityId: paymentId, metadata: { reason } });
    return result;
  }

  async disputePayment(paymentId: string, reason: string, actorId: string) {
    return this.transition(paymentId, FeePaymentRecordStatus.DISPUTED, reason, actorId);
  }

  async resolveDispute(paymentId: string, resolution: 'COMPLETED' | 'REVERSED' | 'FAILED', reason: string, actorId: string) {
    if (resolution === 'REVERSED') return this.reversePayment(paymentId, reason, actorId);
    return this.transition(paymentId, resolution, reason, actorId);
  }

  async studentStatementChronological(merchantId: string, studentId: string) {
    const [invoices, payments, reversals] = await Promise.all([
      this.prisma.feeInvoice.findMany({ where: { merchantId, studentId }, select: { id: true, invoiceNumber: true, totalAmount: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.feePayment.findMany({ where: { merchantId, resolvedStudentId: studentId }, select: { id: true, amount: true, status: true, gatewayPaidAt: true, mmsReceivedAt: true, paymentReference: true }, orderBy: { mmsReceivedAt: 'asc' } }),
      this.prisma.feePaymentReversal.findMany({ where: { merchantId, payment: { resolvedStudentId: studentId } }, select: { id: true, amount: true, reason: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const entries = [
      ...invoices.map((i) => ({ type: 'INVOICE', id: i.id, at: i.createdAt, description: i.invoiceNumber, debit: money(i.totalAmount), credit: money(0) })),
      ...payments.filter((p) => p.status === FeePaymentRecordStatus.COMPLETED).map((p) => ({ type: 'PAYMENT', id: p.id, at: p.gatewayPaidAt ?? p.mmsReceivedAt, description: p.paymentReference, debit: money(0), credit: money(p.amount) })),
      ...reversals.map((r) => ({ type: 'REVERSAL', id: r.id, at: r.createdAt, description: r.reason, debit: money(r.amount), credit: money(0) })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    let balance = money(0);
    return entries.map((entry) => { balance = balance.plus(entry.debit).minus(entry.credit); return { ...entry, debit: entry.debit.toFixed(2), credit: entry.credit.toFixed(2), runningBalance: balance.toFixed(2) }; });
  }

  private async transition(paymentId: string, to: FeePaymentRecordStatus, reason: string, actorId: string) {
    const payment = await this.prisma.feePayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Fee payment not found');
    assertTransition(payment.status, to);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.feePayment.update({ where: { id: paymentId }, data: { status: to } });
      await tx.feePaymentLifecycleEvent.create({ data: { feePaymentId: paymentId, fromStatus: payment.status, toStatus: to, reason, actorId } });
      return result;
    });
    await this.audit.record({ actorId, action: `FEE_PAYMENT_${to}`, entityType: 'fee_payment', entityId: paymentId, metadata: { reason } });
    return updated;
  }

  private dayBounds(date: Date) {
    const start = new Date(date); start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
}
