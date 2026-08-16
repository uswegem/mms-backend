import { Injectable } from '@nestjs/common';
import {
  FeeAllocationRule,
  FeeInvoiceStatus,
  FeeReferenceType,
  Prisma,
  ReferenceLookupOutcome,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { validateDammDigits } from '@shared/domain/alias/damm.util';
import { money } from '../../domain/fee-money.util';
import {
  ReferenceErrorCode,
  ReferenceResolutionException,
} from '../../domain/reference-resolution.exception';
import { ReferenceService } from './reference.service';

export type ReferenceLifecycle = 'issued' | 'active' | 'settled' | 'cancelled';

export interface ResolvedReference {
  reference: string;
  referenceType: FeeReferenceType;
  lifecycle: ReferenceLifecycle;
  merchantId: string;
  schoolName: string;
  schoolStatus: string;
  studentId: string;
  studentNameMasked: string;
  amountDue: Prisma.Decimal;
  currency: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: FeeInvoiceStatus;
  openInvoices?: Array<{
    id: string;
    invoiceNumber: string;
    outstandingBalance: Prisma.Decimal;
    dueDate: Date | null;
  }>;
}

@Injectable()
export class ReferenceResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
  ) {}

  normalize(raw: string): string {
    return raw.replace(/[\s-]/g, '').trim();
  }

  async resolve(
    rawReference: string,
    options: { channel?: string; log?: boolean } = {},
  ): Promise<ResolvedReference> {
    const channel = options.channel ?? 'API';
    const log = options.log !== false;
    const reference = this.normalize(rawReference);

    try {
      const resolved = await this.resolveInternal(reference);
      if (resolved.lifecycle === 'settled') {
        if (log) {
          await this.logLookup({
            reference,
            referenceType: resolved.referenceType,
            outcome: ReferenceLookupOutcome.SETTLED,
            channel,
            merchantId: resolved.merchantId,
            amountDue: money(0),
            resolvedInvoiceId: resolved.invoiceId,
            resolvedStudentId: resolved.studentId,
            errorCode: ReferenceErrorCode.SETTLED,
          });
        }
        throw new ReferenceResolutionException(
          ReferenceErrorCode.SETTLED,
          'Reference is already settled — no outstanding balance',
          409,
        );
      }
      if (resolved.lifecycle === 'cancelled') {
        if (log) {
          await this.logLookup({
            reference,
            referenceType: resolved.referenceType,
            outcome: ReferenceLookupOutcome.CANCELLED,
            channel,
            merchantId: resolved.merchantId,
            resolvedInvoiceId: resolved.invoiceId,
            resolvedStudentId: resolved.studentId,
            errorCode: ReferenceErrorCode.CANCELLED,
          });
        }
        throw new ReferenceResolutionException(
          ReferenceErrorCode.CANCELLED,
          'Invoice reference is cancelled',
          409,
        );
      }
      if (log) {
        await this.logLookup({
          reference,
          referenceType: resolved.referenceType,
          outcome: ReferenceLookupOutcome.SUCCESS,
          channel,
          merchantId: resolved.merchantId,
          amountDue: resolved.amountDue,
          resolvedInvoiceId: resolved.invoiceId,
          resolvedStudentId: resolved.studentId,
        });
      }
      return resolved;
    } catch (err) {
      if (err instanceof ReferenceResolutionException && log) {
        await this.logLookup({
          reference,
          outcome: this.toOutcome(err.code),
          channel,
          errorCode: err.code,
        });
      }
      throw err;
    }
  }

  /** Payer-safe channel payload (no internal UUIDs / phones / fee breakdown). */
  toPayerFacing(resolved: ResolvedReference) {
    return {
      reference: resolved.reference,
      referenceType: resolved.referenceType,
      status: resolved.lifecycle,
      schoolName: resolved.schoolName,
      studentName: resolved.studentNameMasked,
      amountDue: resolved.amountDue.toFixed(2),
      currency: resolved.currency,
      invoiceNumber: resolved.invoiceNumber ?? null,
    };
  }

  async getAllocationRule(merchantId: string): Promise<FeeAllocationRule> {
    const settings = await this.prisma.schoolFeeSettings.upsert({
      where: { merchantId },
      create: { merchantId, allocationRule: FeeAllocationRule.OLDEST_DUE_FIRST },
      update: {},
    });
    return settings.allocationRule;
  }

  private async resolveInternal(reference: string): Promise<ResolvedReference> {
    if (!/^\d{8}$|^\d{13}$/.test(reference)) {
      throw new ReferenceResolutionException(
        ReferenceErrorCode.INVALID_FORMAT,
        'Reference must be an 8-digit student Lipa Namba or 13-digit invoice control number',
      );
    }
    if (!validateDammDigits(reference)) {
      throw new ReferenceResolutionException(
        ReferenceErrorCode.BAD_CHECK_DIGIT,
        'Reference failed check-digit validation',
      );
    }

    if (this.references.isStudentReferenceFormat(reference)) {
      return this.resolveStudent(reference);
    }
    if (this.references.isInvoiceControlFormat(reference)) {
      return this.resolveInvoice(reference);
    }
    throw new ReferenceResolutionException(
      ReferenceErrorCode.INVALID_FORMAT,
      'Unrecognized reference format',
    );
  }

  private async resolveInvoice(reference: string): Promise<ResolvedReference> {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { paymentReference: reference },
      include: { student: true, merchant: true },
    });
    if (!invoice) {
      throw new ReferenceResolutionException(
        ReferenceErrorCode.NOT_FOUND,
        'Payment reference not found',
        404,
      );
    }
    this.assertSchoolPayable(invoice.merchant.status);

    let lifecycle: ReferenceLifecycle = 'active';
    if (invoice.status === 'CANCELLED') lifecycle = 'cancelled';
    else if (invoice.status === 'PAID' || invoice.outstandingBalance.lte(0)) {
      lifecycle = 'settled';
    }

    return {
      reference,
      referenceType: FeeReferenceType.INVOICE,
      lifecycle,
      merchantId: invoice.merchantId,
      schoolName: invoice.merchant.tradingName,
      schoolStatus: invoice.merchant.status,
      studentId: invoice.studentId,
      studentNameMasked: this.mask(invoice.student.fullName),
      amountDue: money(invoice.outstandingBalance),
      currency: invoice.currency,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: invoice.status,
      openInvoices:
        lifecycle === 'active'
          ? [
              {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                outstandingBalance: money(invoice.outstandingBalance),
                dueDate: invoice.dueDate,
              },
            ]
          : [],
    };
  }

  private async resolveStudent(reference: string): Promise<ResolvedReference> {
    const alias = await this.prisma.studentAlias.findUnique({
      where: { alias8digit: reference },
      include: {
        student: true,
        merchant: true,
      },
    });
    if (!alias || !alias.isActive || alias.student.deletedAt) {
      throw new ReferenceResolutionException(
        ReferenceErrorCode.NOT_FOUND,
        'Student reference not found',
        404,
      );
    }
    this.assertSchoolPayable(alias.merchant.status);

    const rule = await this.getAllocationRule(alias.merchantId);
    const openInvoices = await this.prisma.feeInvoice.findMany({
      where: {
        merchantId: alias.merchantId,
        studentId: alias.studentId,
        status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
        outstandingBalance: { gt: 0 },
      },
      orderBy:
        rule === FeeAllocationRule.NEWEST_DUE_FIRST
          ? [{ dueDate: 'desc' }, { createdAt: 'desc' }]
          : [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const amountDue = openInvoices.reduce(
      (sum, inv) => sum.plus(inv.outstandingBalance),
      money(0),
    );

    let lifecycle: ReferenceLifecycle = 'active';
    if (openInvoices.length === 0) lifecycle = 'settled';

    return {
      reference,
      referenceType: FeeReferenceType.STUDENT,
      lifecycle,
      merchantId: alias.merchantId,
      schoolName: alias.merchant.tradingName,
      schoolStatus: alias.merchant.status,
      studentId: alias.studentId,
      studentNameMasked: this.mask(alias.student.fullName),
      amountDue,
      currency: 'TZS',
      openInvoices: openInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        outstandingBalance: money(inv.outstandingBalance),
        dueDate: inv.dueDate,
      })),
    };
  }

  private assertSchoolPayable(status: string) {
    if (status === 'SUSPENDED') {
      throw new ReferenceResolutionException(
        ReferenceErrorCode.SCHOOL_SUSPENDED,
        'School is suspended — payments not accepted',
        403,
      );
    }
    if (status !== 'ACTIVE') {
      throw new ReferenceResolutionException(
        ReferenceErrorCode.SCHOOL_INACTIVE,
        'School is not active for fee collection',
        403,
      );
    }
  }

  private mask(name: string) {
    const trimmed = name.trim();
    if (trimmed.length <= 2) return `${trimmed[0] ?? ''}*`;
    return `${trimmed[0]}***${trimmed[trimmed.length - 1]}`;
  }

  private toOutcome(code: ReferenceErrorCode): ReferenceLookupOutcome {
    const map: Record<ReferenceErrorCode, ReferenceLookupOutcome> = {
      [ReferenceErrorCode.INVALID_FORMAT]: ReferenceLookupOutcome.INVALID_FORMAT,
      [ReferenceErrorCode.BAD_CHECK_DIGIT]: ReferenceLookupOutcome.BAD_CHECK_DIGIT,
      [ReferenceErrorCode.NOT_FOUND]: ReferenceLookupOutcome.NOT_FOUND,
      [ReferenceErrorCode.CANCELLED]: ReferenceLookupOutcome.CANCELLED,
      [ReferenceErrorCode.SETTLED]: ReferenceLookupOutcome.SETTLED,
      [ReferenceErrorCode.SCHOOL_SUSPENDED]: ReferenceLookupOutcome.SCHOOL_SUSPENDED,
      [ReferenceErrorCode.SCHOOL_INACTIVE]: ReferenceLookupOutcome.SCHOOL_INACTIVE,
      [ReferenceErrorCode.NO_OPEN_BALANCE]: ReferenceLookupOutcome.NO_OPEN_BALANCE,
    };
    return map[code];
  }

  private async logLookup(input: {
    reference: string;
    outcome: ReferenceLookupOutcome;
    channel: string;
    merchantId?: string;
    referenceType?: FeeReferenceType;
    amountDue?: Prisma.Decimal;
    errorCode?: string | null;
    resolvedInvoiceId?: string;
    resolvedStudentId?: string;
  }) {
    try {
      await this.prisma.referenceLookupLog.create({
        data: {
          reference: input.reference,
          outcome: input.outcome,
          channel: input.channel,
          merchantId: input.merchantId,
          referenceType: input.referenceType,
          amountDue: input.amountDue,
          errorCode: input.errorCode ?? undefined,
          resolvedInvoiceId: input.resolvedInvoiceId,
          resolvedStudentId: input.resolvedStudentId,
        },
      });
    } catch {
      /* lookup logging must never break payer flow */
    }
  }
}
