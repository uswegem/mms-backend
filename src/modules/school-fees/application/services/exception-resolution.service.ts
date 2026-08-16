import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalEntityType,
  ExceptionCaseStatus,
  ExceptionResolutionAction,
  ExternalSettlementSource,
  Prisma,
  ReconciliationClassification,
  ReconciliationMatchRule,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { MakerCheckerService } from '@modules/maker-checker/application/services/maker-checker.service';
import { isFinancialAction } from '../../domain/exception-case';
import { ExceptionCaseService } from './exception-case.service';
import { InvoicePaymentService } from './invoice-payment.service';
import { PaymentLedgerService } from './payment-ledger.service';

type ResolveInput = {
  caseId: string;
  action: ExceptionResolutionAction;
  actorId: string;
  acquirerId: string;
  note?: string;
  payload?: {
    feePaymentId?: string;
    externalSettlementRecordId?: string;
    paymentReference?: string;
    amount?: string;
    gatewayTxnRef?: string;
    writeOffAmount?: string;
    reason?: string;
  };
};

@Injectable()
export class ExceptionResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: ExceptionCaseService,
    private readonly ledger: PaymentLedgerService,
    private readonly payments: InvoicePaymentService,
    private readonly makerChecker: MakerCheckerService,
  ) {}

  async propose(input: ResolveInput) {
    const exceptionCase = await this.prisma.reconciliationExceptionCase.findUnique({
      where: { id: input.caseId },
    });
    if (!exceptionCase) throw new NotFoundException('Exception case not found');
    const actionable: ExceptionCaseStatus[] = [
      ExceptionCaseStatus.OPEN,
      ExceptionCaseStatus.UNDER_INVESTIGATION,
      ExceptionCaseStatus.ESCALATED,
    ];
    if (!actionable.includes(exceptionCase.status)) {
      throw new BadRequestException(`Case cannot accept actions in status ${exceptionCase.status}`);
    }

    if (input.action === ExceptionResolutionAction.ESCALATE) {
      return this.cases.transition(input.caseId, ExceptionCaseStatus.ESCALATED, input.actorId, {
        action: input.action,
        note: input.note ?? 'Escalated',
      });
    }

    if (input.action === ExceptionResolutionAction.BANK_SIDE_ERROR) {
      return this.executeBankSideError(input);
    }

    const config = await this.prisma.reconciliationConfig.findUnique({
      where: { acquirerId: input.acquirerId },
    });
    const makerCheckerOn = config?.makerCheckerEnabled ?? true;

    if (isFinancialAction(input.action) && makerCheckerOn) {
      const enabled = await this.makerChecker.isEnabled(input.acquirerId, ApprovalEntityType.RECON_EXCEPTION);
      if (enabled) {
        await this.cases.transition(input.caseId, ExceptionCaseStatus.PENDING_APPROVAL, input.actorId, {
          action: input.action,
          note: input.note ?? `Pending approval for ${input.action}`,
          pendingAction: input.action,
          pendingPayload: (input.payload ?? {}) as Prisma.InputJsonValue,
        });
        const task = await this.makerChecker.createTask(
          input.acquirerId,
          ApprovalEntityType.RECON_EXCEPTION,
          input.caseId,
          input.actorId,
        );
        await this.prisma.reconciliationExceptionCase.update({
          where: { id: input.caseId },
          data: { approvalTaskId: task.id },
        });
        return this.cases.detail(input.caseId);
      }
    }

    return this.executeApproved(input);
  }

  async onApprovalDecision(caseId: string, checkerId: string, approved: boolean, notes?: string) {
    const exceptionCase = await this.prisma.reconciliationExceptionCase.findUniqueOrThrow({
      where: { id: caseId },
    });
    if (exceptionCase.status !== ExceptionCaseStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Case is not pending approval');
    }
    if (!approved) {
      return this.cases.transition(caseId, ExceptionCaseStatus.UNDER_INVESTIGATION, checkerId, {
        action: ExceptionResolutionAction.REJECT,
        note: notes ?? 'Checker rejected',
          pendingAction: null,
          pendingPayload: null,
          approvalTaskId: null,
      });
    }
    const action = exceptionCase.pendingAction;
    if (!action) throw new BadRequestException('No pending action on case');
    const payload = (exceptionCase.pendingPayload ?? {}) as ResolveInput['payload'];
    await this.executeApproved({
      caseId,
      action,
      actorId: checkerId,
      acquirerId: '',
      note: notes,
      payload,
    });
    return this.cases.detail(caseId);
  }

  private async executeApproved(input: ResolveInput) {
    switch (input.action) {
      case ExceptionResolutionAction.MANUAL_MATCH:
        await this.executeManualMatch(input);
        break;
      case ExceptionResolutionAction.FORCE_CREATE_PAYMENT:
        await this.executeForceCreate(input);
        break;
      case ExceptionResolutionAction.REVERSE_PAYMENT:
        await this.executeReverse(input);
        break;
      case ExceptionResolutionAction.WRITE_OFF:
        await this.executeWriteOff(input);
        break;
      case ExceptionResolutionAction.BANK_SIDE_ERROR:
        await this.executeBankSideError(input);
        break;
      default:
        throw new BadRequestException(`Unsupported resolution action ${input.action}`);
    }
    return this.cases.transition(input.caseId, ExceptionCaseStatus.RESOLVED, input.actorId, {
      action: ExceptionResolutionAction.APPROVE,
      note: input.note ?? `Resolved via ${input.action}`,
      pendingAction: null,
      pendingPayload: null,
      approvalTaskId: null,
      resolutionNotes: input.note,
    });
  }

  private async executeManualMatch(input: ResolveInput) {
    const paymentId = input.payload?.feePaymentId;
    const externalId = input.payload?.externalSettlementRecordId;
    if (!paymentId || !externalId) {
      throw new BadRequestException('feePaymentId and externalSettlementRecordId are required');
    }
    const [payment, external] = await Promise.all([
      this.prisma.feePayment.findUnique({ where: { id: paymentId } }),
      this.prisma.externalSettlementRecord.findUnique({ where: { id: externalId } }),
    ]);
    if (!payment || !external) throw new NotFoundException('Payment or external record not found');

    const existingPaymentMatch = await this.prisma.reconciliationMatch.findUnique({
      where: { feePaymentId: paymentId },
    });
    const existingExternalMatch = await this.prisma.reconciliationMatch.findUnique({
      where: { externalSettlementRecordId: externalId },
    });
    if (existingPaymentMatch || existingExternalMatch) {
      throw new BadRequestException('Payment or external record already matched');
    }

    const exceptionCase = await this.prisma.reconciliationExceptionCase.findUniqueOrThrow({
      where: { id: input.caseId },
    });
    await this.prisma.reconciliationMatch.create({
      data: {
        runId: exceptionCase.runId ?? (await this.ensureManualRun(input.actorId)),
        merchantId: payment.merchantId,
        matchGroupId: exceptionCase.matchGroupId,
        feePaymentId: payment.id,
        externalSettlementRecordId: external.id,
        classification: ReconciliationClassification.MATCHED,
        rule: ReconciliationMatchRule.MANUAL,
        isManual: true,
        context: { caseId: input.caseId, note: input.note },
      },
    });
    await this.prisma.externalSettlementRecord.update({
      where: { id: external.id },
      data: {
        classification: ReconciliationClassification.MATCHED,
        classificationMeta: { manual: true, caseId: input.caseId },
      },
    });
  }

  private async executeForceCreate(input: ResolveInput) {
    const reference = input.payload?.paymentReference;
    const amount = input.payload?.amount;
    const gatewayTxnRef = input.payload?.gatewayTxnRef ?? `FORCE-${crypto.randomUUID()}`;
    if (!reference || !amount) {
      throw new BadRequestException('paymentReference and amount are required');
    }
    await this.payments.applyFromGatewayNotification({
      outcome: 'success',
      paymentReference: reference,
      amount,
      gatewayTxnRef,
      channel: 'OTHER',
      gatewayPaidAt: new Date().toISOString(),
      rawPayload: { forceCreate: true, caseId: input.caseId },
    });
  }

  private async executeReverse(input: ResolveInput) {
    const paymentId = input.payload?.feePaymentId;
    if (!paymentId) throw new BadRequestException('feePaymentId is required');
    await this.ledger.reversePayment(
      paymentId,
      input.payload?.reason ?? input.note ?? 'Reversed via recon exception',
      input.actorId,
    );
  }

  private async executeWriteOff(input: ResolveInput) {
    const amount = input.payload?.writeOffAmount ?? input.payload?.amount;
    if (!amount) throw new BadRequestException('writeOffAmount is required');
    const exceptionCase = await this.prisma.reconciliationExceptionCase.findUniqueOrThrow({
      where: { id: input.caseId },
    });
    await this.prisma.reconciliationWriteOff.create({
      data: {
        caseId: input.caseId,
        merchantId: exceptionCase.merchantId,
        amount: new Prisma.Decimal(amount),
        reason: input.payload?.reason ?? input.note ?? 'Write-off',
        approvedBy: input.actorId,
        createdBy: input.actorId,
      },
    });
  }

  private async executeBankSideError(input: ResolveInput) {
    const externalId = input.payload?.externalSettlementRecordId;
    const exceptionCase = await this.prisma.reconciliationExceptionCase.findUniqueOrThrow({
      where: { id: input.caseId },
    });
    const context = (exceptionCase.context ?? {}) as { externalIds?: string[] };
    const ids = externalId ? [externalId] : context.externalIds ?? [];
    if (ids.length) {
      await this.prisma.externalSettlementRecord.updateMany({
        where: { id: { in: ids } },
        data: {
          excludeFromMatching: true,
          classification: ReconciliationClassification.UNMATCHED_EXTERNAL,
          classificationMeta: { bankSideError: true, caseId: input.caseId },
        },
      });
    }
    if (input.action === ExceptionResolutionAction.BANK_SIDE_ERROR) {
      return this.cases.transition(input.caseId, ExceptionCaseStatus.RESOLVED, input.actorId, {
        action: input.action,
        note: input.note ?? 'Marked as bank-side error',
        resolutionNotes: input.note,
      });
    }
  }

  private async ensureManualRun(actorId: string) {
    const run = await this.prisma.reconciliationRun.create({
      data: {
        mode: 'MANUAL',
        dateFrom: new Date(),
        dateTo: new Date(),
        status: 'COMPLETED',
        finishedAt: new Date(),
        createdBy: actorId,
        summary: { manual: true },
      },
    });
    return run.id;
  }
}
