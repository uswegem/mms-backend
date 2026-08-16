import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeeReferenceType, Prisma } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { GatewayNotification } from '../ports/payment-gateway.port';
import { applyPaymentToInvoice, money } from '../../domain/fee-money.util';
import {
  ReferenceErrorCode,
  ReferenceResolutionException,
} from '../../domain/reference-resolution.exception';
import { ReferenceResolutionService } from './reference-resolution.service';

@Injectable()
export class InvoicePaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly resolution: ReferenceResolutionService,
  ) {}

  async lookupByReference(paymentReference: string, channel = 'API') {
    try {
      const resolved = await this.resolution.resolve(paymentReference, {
        channel,
      });
      return this.resolution.toPayerFacing(resolved);
    } catch (err) {
      this.rethrowAsHttp(err);
    }
  }

  async applyFromGatewayNotification(payload: GatewayNotification) {
    if (payload.outcome !== 'success') {
      return { applied: false, status: payload.outcome };
    }
    const amount = money(payload.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Payment amount must be positive');
    }

    let resolved;
    try {
      resolved = await this.resolution.resolve(payload.paymentReference, {
        channel: payload.channel ?? 'MOCK',
        log: true,
      });
    } catch (err) {
      this.rethrowAsHttp(err);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const previous = await tx.feePayment.findUnique({
          where: { gatewayTxnRef: payload.gatewayTxnRef },
        });
        if (previous) {
          await this.audit.record({
            actorId: null,
            action: 'FEE_PAYMENT_DUPLICATE_IGNORED',
            entityType: 'fee_payment',
            entityId: previous.id,
            metadata: { gatewayTxnRef: payload.gatewayTxnRef },
          });
          return { applied: false, duplicate: true, paymentId: previous.id };
        }

        const targets = resolved.openInvoices ?? [];
        if (!targets.length) {
          throw new BadRequestException('No open invoices for this reference');
        }

        for (const t of targets) {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM fee_invoices WHERE id = ${t.id}::uuid FOR UPDATE`,
          );
        }

        let remaining = amount;
        const allocationPlan: Array<{ invoiceId: string; amount: Prisma.Decimal }> =
          [];
        const now = new Date();
        const gatewayPaidAt = payload.gatewayPaidAt ? new Date(payload.gatewayPaidAt) : now;

        for (const t of targets) {
          if (remaining.lte(0)) break;
          const locked = await tx.feeInvoice.findUniqueOrThrow({
            where: { id: t.id },
            include: { academicTerm: true },
          });
          if (locked.status === 'CANCELLED') continue;
          const applyAmt = Prisma.Decimal.min(
            remaining,
            money(locked.outstandingBalance),
          );
          if (applyAmt.lte(0)) continue;

          const state = applyPaymentToInvoice({
            totalAmount: locked.totalAmount,
            amountPaid: locked.amountPaid,
            paymentAmount: applyAmt,
          });
          const termEnded =
            !!locked.academicTerm.endsOn && locked.academicTerm.endsOn < now;

          await tx.feeInvoice.update({
            where: { id: locked.id },
            data: {
              amountPaid: state.amountPaid,
              outstandingBalance: state.outstandingBalance,
              status: state.status,
              isOverdue:
                state.outstandingBalance.gt(0) &&
                !!locked.dueDate &&
                locked.dueDate < now,
              isLatePayment: locked.isLatePayment || termEnded,
            },
          });

          allocationPlan.push({ invoiceId: locked.id, amount: applyAmt });
          remaining = money(remaining.minus(applyAmt));
        }

        if (!allocationPlan.length) {
          throw new BadRequestException('Unable to allocate payment to invoices');
        }

        const overpayment = remaining;
        const primaryInvoiceId = allocationPlan[0].invoiceId;

        const payment = await tx.feePayment.create({
          data: {
            merchantId: resolved.merchantId,
            invoiceId: primaryInvoiceId,
            paymentReference: resolved.reference,
            referenceType: resolved.referenceType,
            resolvedStudentId: resolved.studentId,
            resolvedInvoiceId:
              resolved.referenceType === FeeReferenceType.INVOICE
                ? resolved.invoiceId
                : primaryInvoiceId,
            amountDueAtLookup: resolved.amountDue,
            gatewayTxnRef: payload.gatewayTxnRef,
            amount,
            status: 'COMPLETED',
            channel: payload.channel ?? 'MOCK',
            payerNameMasked: payload.payerNameMasked,
            payerMsisdnMasked: payload.payerMsisdnMasked,
            gatewayPaidAt: gatewayPaidAt,
            mmsReceivedAt: now,
            paidAt: now,
            rawPayload: payload.rawPayload as Prisma.InputJsonValue | undefined,
            allocations: {
              create: allocationPlan.map((a) => ({
                invoiceId: a.invoiceId,
                merchantId: resolved.merchantId,
                amount: a.amount,
              })),
            },
          },
          include: { allocations: true },
        });

        if (overpayment.gt(0)) {
          await tx.studentAccountCredit.create({
            data: {
              merchantId: resolved.merchantId,
              studentId: resolved.studentId,
              amount: overpayment,
              reason: `Overpayment for reference ${resolved.reference}`,
              feePaymentId: payment.id,
            },
          });
        }

        await this.audit.record({
          actorId: null,
          action: 'FEE_PAYMENT_APPLIED',
          entityType: 'fee_payment',
          entityId: payment.id,
          metadata: {
            reference: resolved.reference,
            referenceType: resolved.referenceType,
            gatewayTxnRef: payload.gatewayTxnRef,
            allocations: allocationPlan.map((a) => ({
              invoiceId: a.invoiceId,
              amount: a.amount.toString(),
            })),
            overpayment: overpayment.toString(),
          },
        });

        return {
          applied: true,
          paymentId: payment.id,
          referenceType: resolved.referenceType,
          allocations: payment.allocations,
          overpayment: overpayment.toString(),
        };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return { applied: false, duplicate: true };
      }
      throw error;
    }
  }

  private rethrowAsHttp(err: unknown): never {
    if (err instanceof ReferenceResolutionException) {
      if (err.code === ReferenceErrorCode.NOT_FOUND) {
        throw new NotFoundException({ code: err.code, message: err.message });
      }
      throw new BadRequestException({ code: err.code, message: err.message });
    }
    throw err;
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
