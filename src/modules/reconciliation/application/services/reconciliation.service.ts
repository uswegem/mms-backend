import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ReconciliationExceptionStatus,
  ReconciliationExceptionType,
} from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { ReconciliationRepository } from '../../infrastructure/persistence/reconciliation.repository';
import { TipsSettlementReportProvider } from '../ports/tips-settlement-report.port';

export interface MatchSummary {
  merchantId: string;
  cycleDate: Date;
  matched: number;
  exceptions: number;
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly reconciliation: ReconciliationRepository,
    private readonly tipsReport: TipsSettlementReportProvider,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Compares our ledger against the TIPS settlement report for one
   * merchant/date and replaces that day's OPEN exception set with the
   * result. Three exception types (brief/design screens): a report line
   * with no matching ledger entry, a ledger entry with no matching report
   * line, and a reference repeated within the report itself.
   */
  async runMatch(merchantId: string, cycleDate: Date): Promise<MatchSummary> {
    const [ledger, report] = await Promise.all([
      this.reconciliation.findSuccessPayments(merchantId, cycleDate),
      this.tipsReport.getSettlementReport(merchantId, cycleDate),
    ]);

    const ledgerByRef = new Map(ledger.map((p) => [p.tipsEndToEndId, p]));
    const reportRefCounts = new Map<string, number>();
    for (const line of report) {
      reportRefCounts.set(
        line.tipsEndToEndId,
        (reportRefCounts.get(line.tipsEndToEndId) ?? 0) + 1,
      );
    }

    const exceptions: Prisma.ReconciliationExceptionUncheckedCreateInput[] = [];
    const matchedRefs = new Set<string>();
    const flaggedDuplicates = new Set<string>();

    for (const line of report) {
      const count = reportRefCounts.get(line.tipsEndToEndId) ?? 0;
      if (count > 1) {
        // One exception per duplicated reference, not one per occurrence —
        // a reference appearing N times is a single case for a human to
        // investigate, not N of them.
        if (!flaggedDuplicates.has(line.tipsEndToEndId)) {
          flaggedDuplicates.add(line.tipsEndToEndId);
          exceptions.push({
            merchantId,
            cycleDate,
            type: ReconciliationExceptionType.DUPLICATE_REFERENCE,
            tipsEndToEndId: line.tipsEndToEndId,
            amount: line.amount,
          });
        }
        continue;
      }
      if (!ledgerByRef.has(line.tipsEndToEndId)) {
        exceptions.push({
          merchantId,
          cycleDate,
          type: ReconciliationExceptionType.UNMATCHED_IN_REPORT,
          tipsEndToEndId: line.tipsEndToEndId,
          amount: line.amount,
        });
        continue;
      }
      matchedRefs.add(line.tipsEndToEndId);
    }

    for (const payment of ledger) {
      if (!reportRefCounts.has(payment.tipsEndToEndId)) {
        exceptions.push({
          merchantId,
          cycleDate,
          type: ReconciliationExceptionType.UNMATCHED_IN_LEDGER,
          tipsEndToEndId: payment.tipsEndToEndId,
          amount: payment.amount,
        });
      }
    }

    await this.reconciliation.replaceOpenExceptions(
      merchantId,
      cycleDate,
      exceptions,
    );

    await this.audit.record({
      actorId: null,
      action: 'RECONCILIATION_MATCH_RUN',
      entityType: 'reconciliation',
      entityId: merchantId,
      metadata: {
        cycleDate: cycleDate.toISOString(),
        matched: matchedRefs.size,
        exceptions: exceptions.length,
      },
    });

    return {
      merchantId,
      cycleDate,
      matched: matchedRefs.size,
      exceptions: exceptions.length,
    };
  }

  async list(query: {
    merchantId?: string;
    status?: ReconciliationExceptionStatus;
    page: number;
    pageSize: number;
  }) {
    return this.reconciliation.list(query);
  }

  async getById(id: string) {
    const exception = await this.reconciliation.findById(id);
    if (!exception)
      throw new NotFoundException('Reconciliation exception not found');
    return exception;
  }

  async resolve(
    id: string,
    status: Extract<ReconciliationExceptionStatus, 'RESOLVED' | 'WRITTEN_OFF'>,
    notes: string | undefined,
    actorId: string,
  ) {
    await this.getById(id); // 404s before writing if it doesn't exist
    const updated = await this.reconciliation.resolve(
      id,
      status,
      notes,
      actorId,
    );

    await this.audit.record({
      actorId,
      action: 'RECONCILIATION_EXCEPTION_RESOLVED',
      entityType: 'reconciliation_exception',
      entityId: id,
      metadata: { status, notes },
    });

    return updated;
  }
}
