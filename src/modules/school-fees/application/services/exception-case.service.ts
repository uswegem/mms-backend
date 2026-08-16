import { Injectable } from '@nestjs/common';
import {
  ExceptionCaseStatus,
  ExceptionResolutionAction,
  ExceptionSeverity,
  Prisma,
  ReconciliationClassification,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import {
  OPEN_EXCEPTION_STATUSES,
  assertExceptionTransition,
  exceptionFingerprint,
  severityForClassification,
} from '../../domain/exception-case';

@Injectable()
export class ExceptionCaseService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertOpenCase(input: {
    runId?: string | null;
    matchGroupId?: string | null;
    merchantId?: string | null;
    classification: ReconciliationClassification;
    title: string;
    summary?: string;
    context?: Prisma.InputJsonValue;
    paymentIds?: string[];
    externalIds?: string[];
    reference?: string | null;
    createdBy?: string | null;
    slaHours?: number;
  }) {
    const fingerprint = exceptionFingerprint({
      classification: input.classification,
      merchantId: input.merchantId,
      paymentIds: input.paymentIds,
      externalIds: input.externalIds,
      reference: input.reference,
    });

    const existing = await this.prisma.reconciliationExceptionCase.findFirst({
      where: { fingerprint, status: { in: OPEN_EXCEPTION_STATUSES } },
    });
    if (existing) {
      return this.prisma.reconciliationExceptionCase.update({
        where: { id: existing.id },
        data: {
          runId: input.runId ?? existing.runId,
          matchGroupId: input.matchGroupId ?? existing.matchGroupId,
          context: input.context ?? existing.context ?? undefined,
          summary: input.summary ?? existing.summary,
        },
      });
    }

    const caseNumber = await this.nextCaseNumber();
    const slaDueAt = new Date(Date.now() + (input.slaHours ?? 48) * 3600000);
    const severity = severityForClassification(input.classification) as ExceptionSeverity;

    const created = await this.prisma.reconciliationExceptionCase.create({
      data: {
        caseNumber,
        runId: input.runId ?? undefined,
        matchGroupId: input.matchGroupId ?? undefined,
        merchantId: input.merchantId ?? undefined,
        classification: input.classification,
        status: ExceptionCaseStatus.OPEN,
        severity,
        fingerprint,
        title: input.title,
        summary: input.summary,
        context: input.context,
        createdBy: input.createdBy ?? undefined,
        slaDueAt,
      },
    });

    await this.prisma.reconciliationExceptionEvent.create({
      data: {
        caseId: created.id,
        toStatus: ExceptionCaseStatus.OPEN,
        note: 'Case opened from reconciliation run',
        actorId: input.createdBy ?? undefined,
        payload: input.context,
      },
    });

    return created;
  }

  async list(query: {
    status?: ExceptionCaseStatus;
    merchantId?: string;
    severity?: ExceptionSeverity;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ReconciliationExceptionCaseWhereInput = {
      status: query.status,
      merchantId: query.merchantId,
      severity: query.severity,
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.reconciliationExceptionCase.count({ where }),
      this.prisma.reconciliationExceptionCase.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { matchGroup: { include: { legs: true } }, events: { orderBy: { createdAt: 'desc' }, take: 5 } },
      }),
    ]);
    return { data, total, page, limit };
  }

  async detail(id: string, sanitizeForSchool = false) {
    const item = await this.prisma.reconciliationExceptionCase.findUniqueOrThrow({
      where: { id },
      include: {
        matchGroup: { include: { legs: { include: { payment: true, external: true } } } },
        events: { orderBy: { createdAt: 'asc' } },
        writeOffs: true,
      },
    });
    if (!sanitizeForSchool) return item;
    return {
      id: item.id,
      caseNumber: item.caseNumber,
      status: item.status,
      severity: item.severity,
      classification: item.classification,
      title: item.title,
      summary: item.summary,
      merchantId: item.merchantId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      resolvedAt: item.resolvedAt,
      // School view: no raw bank payloads / payer PII from external legs
      legs: (item.matchGroup?.legs ?? []).map((leg) => ({
        legType: leg.legType,
        amount: leg.amount,
        currency: leg.currency,
        valueDate: leg.valueDate,
        paymentReference: leg.paymentReference,
        feePaymentId: leg.feePaymentId,
      })),
      events: item.events.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        action: event.action,
        note: event.note,
        createdAt: event.createdAt,
      })),
    };
  }

  async transition(
    caseId: string,
    toStatus: ExceptionCaseStatus,
    actorId: string,
    opts: {
      action?: ExceptionResolutionAction;
      note?: string;
      payload?: Prisma.InputJsonValue;
      approvalTaskId?: string | null;
      pendingAction?: ExceptionResolutionAction | null;
      pendingPayload?: Prisma.InputJsonValue | null;
      resolutionNotes?: string;
    } = {},
  ) {
    const current = await this.prisma.reconciliationExceptionCase.findUniqueOrThrow({ where: { id: caseId } });
    assertExceptionTransition(current.status, toStatus);
    const data: Prisma.ReconciliationExceptionCaseUpdateInput = {
      status: toStatus,
      approvalTaskId: opts.approvalTaskId === undefined ? undefined : opts.approvalTaskId,
      pendingAction: opts.pendingAction === undefined ? undefined : opts.pendingAction,
      pendingPayload:
        opts.pendingPayload === undefined
          ? undefined
          : opts.pendingPayload === null
            ? Prisma.DbNull
            : opts.pendingPayload,
      resolutionNotes: opts.resolutionNotes,
      resolvedAt: toStatus === ExceptionCaseStatus.RESOLVED ? new Date() : current.resolvedAt,
      closedAt:
        toStatus === ExceptionCaseStatus.CLOSED || toStatus === ExceptionCaseStatus.AUTO_CLOSED
          ? new Date()
          : current.closedAt,
    };
    const updated = await this.prisma.reconciliationExceptionCase.update({ where: { id: caseId }, data });
    await this.prisma.reconciliationExceptionEvent.create({
      data: {
        caseId,
        fromStatus: current.status,
        toStatus,
        action: opts.action,
        note: opts.note,
        actorId,
        payload: opts.payload,
      },
    });
    return updated;
  }

  private async nextCaseNumber() {
    const count = await this.prisma.reconciliationExceptionCase.count();
    return `REX-${String(count + 1).padStart(6, '0')}`;
  }
}
