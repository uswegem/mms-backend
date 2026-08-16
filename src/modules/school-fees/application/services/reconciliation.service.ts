import { Injectable } from '@nestjs/common';
import {
  ExternalSettlementSource,
  FeePaymentRecordStatus,
  MatchGroupLegType,
  MatchGroupStatus,
  Prisma,
  ReconciliationClassification,
  ReconciliationMatchRule,
  ReconciliationRunStatus,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { decideMatch } from '../../domain/reconciliation-matching';
import {
  amountsConflict,
  classifyMatchGroupStatus,
  exceptionClassificationForGroup,
} from '../../domain/exception-case';
import { ExceptionCaseService } from './exception-case.service';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exceptions: ExceptionCaseService,
  ) {}

  async startRun(input: {
    source?: ExternalSettlementSource;
    dateFrom: Date;
    dateTo: Date;
    dateWindowDays?: number;
    softDateVarianceDays?: number;
    hardDateVarianceDays?: number;
    threeWay?: boolean;
    actorId: string;
  }) {
    if (input.threeWay || !input.source) {
      return this.startThreeWayRun(input);
    }
    return this.startTwoWayRun(input);
  }

  private async startTwoWayRun(input: {
    source?: ExternalSettlementSource;
    dateFrom: Date;
    dateTo: Date;
    dateWindowDays?: number;
    softDateVarianceDays?: number;
    hardDateVarianceDays?: number;
    actorId: string;
  }) {
    const softDays = input.softDateVarianceDays ?? input.dateWindowDays ?? 1;
    const hardDays = input.hardDateVarianceDays ?? 3;
    const run = await this.prisma.reconciliationRun.create({
      data: {
        source: input.source,
        mode: 'TWO_WAY',
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        dateWindowDays: softDays,
        softDateVarianceDays: softDays,
        hardDateVarianceDays: hardDays,
        createdBy: input.actorId,
      },
    });
    try {
      const { counts, externalProcessed } = await this.matchSourceToMms({
        runId: run.id,
        source: input.source!,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        softDays,
        hardDays,
        actorId: input.actorId,
        openExceptions: true,
      });
      return this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationRunStatus.COMPLETED,
          finishedAt: new Date(),
          summary: { ...counts, externalProcessed, mode: 'TWO_WAY' } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      await this.prisma.reconciliationMatch.deleteMany({ where: { runId: run.id } });
      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationRunStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown reconciliation failure',
        },
      });
      throw error;
    }
  }

  async startThreeWayRun(input: {
    dateFrom: Date;
    dateTo: Date;
    dateWindowDays?: number;
    softDateVarianceDays?: number;
    hardDateVarianceDays?: number;
    actorId: string;
  }) {
    const softDays = input.softDateVarianceDays ?? input.dateWindowDays ?? 1;
    const hardDays = input.hardDateVarianceDays ?? 3;
    const run = await this.prisma.reconciliationRun.create({
      data: {
        mode: 'THREE_WAY',
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        dateWindowDays: softDays,
        softDateVarianceDays: softDays,
        hardDateVarianceDays: hardDays,
        createdBy: input.actorId,
      },
    });
    try {
      // 1) TIPS ↔ MMS (reuse 4c decideMatch)
      const tips = await this.matchSourceToMms({
        runId: run.id,
        source: ExternalSettlementSource.TIPS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        softDays,
        hardDays,
        actorId: input.actorId,
        openExceptions: false,
        ruleOverride: ReconciliationMatchRule.TIPS_TO_MMS,
      });

      // Seed groups from TIPS↔MMS matches + unmatched MMS/TIPS
      const groupByPayment = new Map<string, string>();
      const groupByTipsExternal = new Map<string, string>();
      const tipsMatches = await this.prisma.reconciliationMatch.findMany({
        where: { runId: run.id, external: { source: ExternalSettlementSource.TIPS } },
        include: { payment: true, external: true },
      });

      for (const match of tipsMatches) {
        const legs: Array<{
          legType: MatchGroupLegType;
          feePaymentId?: string;
          externalSettlementRecordId?: string;
          amount: Prisma.Decimal;
          currency: string;
          valueDate?: Date | null;
          paymentReference?: string | null;
        }> = [];
        if (match.payment) {
          legs.push({
            legType: MatchGroupLegType.MMS,
            feePaymentId: match.payment.id,
            amount: match.payment.amount,
            currency: match.payment.currency,
            valueDate: match.payment.gatewayPaidAt ?? match.payment.mmsReceivedAt,
            paymentReference: match.payment.paymentReference,
          });
        }
        if (match.external) {
          legs.push({
            legType: MatchGroupLegType.TIPS,
            externalSettlementRecordId: match.external.id,
            amount: match.external.amount,
            currency: match.external.currency,
            valueDate: match.external.valueDate,
            paymentReference: match.external.paymentReference,
          });
        }
        const status = classifyMatchGroupStatus(legs);
        const group = await this.createGroup(run.id, match.merchantId, status, legs);
        await this.prisma.reconciliationMatch.update({
          where: { id: match.id },
          data: { matchGroupId: group.id },
        });
        if (match.feePaymentId) groupByPayment.set(match.feePaymentId, group.id);
        if (match.externalSettlementRecordId) groupByTipsExternal.set(match.externalSettlementRecordId, group.id);
      }

      // Unmatched internal MMS (no TIPS match yet)
      const unmatchedInternal = await this.prisma.reconciliationMatch.findMany({
        where: {
          runId: run.id,
          classification: ReconciliationClassification.UNMATCHED_INTERNAL,
          matchGroupId: null,
        },
        include: { payment: true },
      });
      for (const match of unmatchedInternal) {
        if (!match.payment) continue;
        const legs = [{
          legType: MatchGroupLegType.MMS,
          feePaymentId: match.payment.id,
          amount: match.payment.amount,
          currency: match.payment.currency,
          valueDate: match.payment.gatewayPaidAt ?? match.payment.mmsReceivedAt,
          paymentReference: match.payment.paymentReference,
        }];
        const group = await this.createGroup(run.id, match.merchantId, MatchGroupStatus.MMS_ONLY, legs);
        await this.prisma.reconciliationMatch.update({
          where: { id: match.id },
          data: { matchGroupId: group.id },
        });
        groupByPayment.set(match.payment.id, group.id);
      }

      // 2) CBS ↔ TIPS / MMS
      const cbsRecords = await this.prisma.externalSettlementRecord.findMany({
        where: {
          source: ExternalSettlementSource.CBS,
          excludeFromMatching: false,
          valueDate: { gte: input.dateFrom, lte: input.dateTo },
          match: { is: null },
        },
      });

      const cbsCounts: Record<string, number> = {};
      const claimedCbs = new Set<string>();
      const bulkCandidates = new Map<string, typeof cbsRecords>();

      for (const cbs of cbsRecords) {
        // Prefer tipsTxnId → TIPS external
        let tipsExternal = cbs.tipsTxnId
          ? await this.prisma.externalSettlementRecord.findFirst({
              where: { source: ExternalSettlementSource.TIPS, externalTxnId: cbs.tipsTxnId },
            })
          : null;
        if (!tipsExternal && cbs.paymentReference) {
          tipsExternal = await this.prisma.externalSettlementRecord.findFirst({
            where: {
              source: ExternalSettlementSource.TIPS,
              paymentReference: cbs.paymentReference,
              valueDate: {
                gte: new Date(cbs.valueDate.getTime() - hardDays * 86400000),
                lte: new Date(cbs.valueDate.getTime() + hardDays * 86400000),
              },
            },
          });
        }

        let payment = tipsExternal
          ? await this.prisma.feePayment.findFirst({
              where: {
                OR: [
                  { gatewayTxnRef: tipsExternal.externalTxnId },
                  { paymentReference: tipsExternal.paymentReference ?? undefined },
                ],
                status: FeePaymentRecordStatus.COMPLETED,
              },
            })
          : null;

        if (!payment && cbs.paymentReference) {
          payment = await this.prisma.feePayment.findFirst({
            where: {
              paymentReference: cbs.paymentReference,
              status: FeePaymentRecordStatus.COMPLETED,
              reconciliationMatches: { none: {} },
            },
          });
        }

        // Bulk CBS (no single TIPS) — stage for sum check; do not auto-bind
        if (!tipsExternal && !payment && cbs.narration?.toUpperCase().includes('BULK')) {
          const key = `${cbs.creditAccount ?? 'NA'}|${cbs.valueDate.toISOString().slice(0, 10)}`;
          const list = bulkCandidates.get(key) ?? [];
          list.push(cbs);
          bulkCandidates.set(key, list);
          continue;
        }

        let groupId =
          (payment && groupByPayment.get(payment.id)) ||
          (tipsExternal && groupByTipsExternal.get(tipsExternal.id)) ||
          null;

        const cbsLeg: {
          legType: MatchGroupLegType;
          feePaymentId?: string | null;
          externalSettlementRecordId?: string | null;
          amount: Prisma.Decimal;
          currency: string;
          valueDate?: Date | null;
          paymentReference?: string | null;
        } = {
          legType: MatchGroupLegType.CBS,
          externalSettlementRecordId: cbs.id,
          amount: cbs.amount,
          currency: cbs.currency,
          valueDate: cbs.valueDate,
          paymentReference: cbs.paymentReference,
        };

        if (!groupId) {
          const seedLegs: typeof cbsLeg[] = [cbsLeg];
          if (payment) {
            seedLegs.unshift({
              legType: MatchGroupLegType.MMS,
              feePaymentId: payment.id,
              amount: payment.amount,
              currency: payment.currency,
              valueDate: payment.gatewayPaidAt ?? payment.mmsReceivedAt,
              paymentReference: payment.paymentReference,
            });
          }
          if (tipsExternal) {
            seedLegs.splice(payment ? 1 : 0, 0, {
              legType: MatchGroupLegType.TIPS,
              externalSettlementRecordId: tipsExternal.id,
              amount: tipsExternal.amount,
              currency: tipsExternal.currency,
              valueDate: tipsExternal.valueDate,
              paymentReference: tipsExternal.paymentReference,
            });
          }
          const conflict = amountsConflict([
            payment?.amount,
            tipsExternal?.amount,
            cbs.amount,
          ]);
          const status = classifyMatchGroupStatus(seedLegs, conflict);
          const group = await this.createGroup(
            run.id,
            payment?.merchantId ?? null,
            status,
            seedLegs,
          );
          groupId = group.id;
          if (payment) groupByPayment.set(payment.id, groupId);
          if (tipsExternal) groupByTipsExternal.set(tipsExternal.id, groupId);
        } else {
          await this.prisma.reconciliationMatchGroupLeg.create({
            data: { groupId, ...cbsLeg },
          });
          const group = await this.prisma.reconciliationMatchGroup.findUniqueOrThrow({
            where: { id: groupId },
            include: { legs: true },
          });
          const conflict = amountsConflict(group.legs.map((leg) => leg.amount));
          const status = classifyMatchGroupStatus(group.legs, conflict);
          await this.prisma.reconciliationMatchGroup.update({
            where: { id: groupId },
            data: { status },
          });
        }

        const classification = tipsExternal
          ? amountsConflict([tipsExternal.amount, cbs.amount, payment?.amount])
            ? ReconciliationClassification.CROSS_LEG_AMOUNT_CONFLICT
            : ReconciliationClassification.MATCHED
          : payment
            ? ReconciliationClassification.MATCHED
            : ReconciliationClassification.ORPHAN_CBS;

        // Unique feePaymentId: only attach payment if not already claimed in a match
        const paymentAlreadyMatched = payment
          ? await this.prisma.reconciliationMatch.findUnique({ where: { feePaymentId: payment.id } })
          : null;

        await this.prisma.reconciliationMatch.create({
          data: {
            runId: run.id,
            merchantId: payment?.merchantId ?? null,
            matchGroupId: groupId,
            externalSettlementRecordId: cbs.id,
            feePaymentId: payment && !paymentAlreadyMatched ? payment.id : null,
            classification,
            rule: tipsExternal
              ? ReconciliationMatchRule.CBS_TO_TIPS
              : payment
                ? ReconciliationMatchRule.CBS_TO_MMS
                : ReconciliationMatchRule.NONE,
            amountDelta: payment
              ? cbs.amount.minus(payment.amount).toNumber()
              : tipsExternal
                ? cbs.amount.minus(tipsExternal.amount).toNumber()
                : null,
            context: {
              tipsExternalId: tipsExternal?.id,
              paymentId: payment?.id,
            },
          },
        });
        await this.prisma.externalSettlementRecord.update({
          where: { id: cbs.id },
          data: { classification, classificationMeta: { runId: run.id } },
        });
        claimedCbs.add(cbs.id);
        cbsCounts[classification] = (cbsCounts[classification] ?? 0) + 1;
      }

      // Bulk CBS sum review exceptions (no silent auto-bind)
      for (const [key, rows] of bulkCandidates) {
        const sum = rows.reduce((acc, row) => acc.plus(row.amount), new Prisma.Decimal(0));
        const group = await this.createGroup(
          run.id,
          null,
          MatchGroupStatus.CBS_ONLY,
          rows.map((row) => ({
            legType: MatchGroupLegType.CBS,
            externalSettlementRecordId: row.id,
            amount: row.amount,
            currency: row.currency,
            valueDate: row.valueDate,
            paymentReference: row.paymentReference,
          })),
        );
        for (const row of rows) {
          await this.prisma.reconciliationMatch.create({
            data: {
              runId: run.id,
              matchGroupId: group.id,
              externalSettlementRecordId: row.id,
              classification: ReconciliationClassification.BULK_SUM_MISMATCH,
              rule: ReconciliationMatchRule.BULK_CBS_SUM,
              context: { bulkKey: key, bulkSum: sum.toString() },
            },
          });
          await this.prisma.externalSettlementRecord.update({
            where: { id: row.id },
            data: {
              classification: ReconciliationClassification.BULK_SUM_MISMATCH,
              classificationMeta: { bulkKey: key, requiresManualBind: true },
            },
          });
        }
        await this.exceptions.upsertOpenCase({
          runId: run.id,
          matchGroupId: group.id,
          classification: ReconciliationClassification.BULK_SUM_MISMATCH,
          title: `Bulk CBS sum review (${key})`,
          summary: `CBS bulk of ${rows.length} rows totaling ${sum.toString()} requires manual TIPS bind`,
          externalIds: rows.map((row) => row.id),
          createdBy: input.actorId,
          context: { bulkKey: key, bulkSum: sum.toString() },
        });
      }

      // 3) Finalize group statuses + open exceptions
      const groups = await this.prisma.reconciliationMatchGroup.findMany({
        where: { runId: run.id },
        include: { legs: true },
      });
      let fullyMatched = 0;
      for (const group of groups) {
        const conflict = amountsConflict(group.legs.map((leg) => leg.amount));
        const status = classifyMatchGroupStatus(group.legs, conflict);
        if (status !== group.status) {
          await this.prisma.reconciliationMatchGroup.update({
            where: { id: group.id },
            data: { status },
          });
        }
        if (status === MatchGroupStatus.FULLY_MATCHED) {
          fullyMatched++;
          continue;
        }
        const classification = exceptionClassificationForGroup(status);
        if (!classification) continue;
        await this.exceptions.upsertOpenCase({
          runId: run.id,
          matchGroupId: group.id,
          merchantId: group.merchantId,
          classification,
          title: `Three-way ${status}`,
          summary: `Match group ${group.id} ended as ${status}`,
          paymentIds: group.legs.filter((l) => l.feePaymentId).map((l) => l.feePaymentId!),
          externalIds: group.legs
            .filter((l) => l.externalSettlementRecordId)
            .map((l) => l.externalSettlementRecordId!),
          createdBy: input.actorId,
        });
      }

      // Also open exceptions for DATE_VARIANCE_REVIEW / AMOUNT_MISMATCH from TIPS pass
      const reviewMatches = await this.prisma.reconciliationMatch.findMany({
        where: {
          runId: run.id,
          classification: {
            in: [
              ReconciliationClassification.DATE_VARIANCE_REVIEW,
              ReconciliationClassification.AMOUNT_MISMATCH,
              ReconciliationClassification.UNMATCHED_EXTERNAL,
            ],
          },
        },
      });
      for (const match of reviewMatches) {
        await this.exceptions.upsertOpenCase({
          runId: run.id,
          matchGroupId: match.matchGroupId,
          merchantId: match.merchantId,
          classification: match.classification,
          title: match.classification.replace(/_/g, ' '),
          paymentIds: match.feePaymentId ? [match.feePaymentId] : undefined,
          externalIds: match.externalSettlementRecordId
            ? [match.externalSettlementRecordId]
            : undefined,
          createdBy: input.actorId,
          context: (match.context ?? undefined) as Prisma.InputJsonValue | undefined,
        });
      }

      return this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationRunStatus.COMPLETED,
          finishedAt: new Date(),
          summary: {
            mode: 'THREE_WAY',
            tips,
            cbs: cbsCounts,
            groups: groups.length,
            fullyMatched,
            bulkKeys: bulkCandidates.size,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      await this.prisma.reconciliationMatch.deleteMany({ where: { runId: run.id } });
      await this.prisma.reconciliationMatchGroup.deleteMany({ where: { runId: run.id } });
      await this.prisma.reconciliationExceptionCase.deleteMany({ where: { runId: run.id } });
      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationRunStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown reconciliation failure',
        },
      });
      throw error;
    }
  }

  private async matchSourceToMms(opts: {
    runId: string;
    source: ExternalSettlementSource;
    dateFrom: Date;
    dateTo: Date;
    softDays: number;
    hardDays: number;
    actorId: string;
    openExceptions: boolean;
    ruleOverride?: ReconciliationMatchRule;
  }) {
    const externals = await this.prisma.externalSettlementRecord.findMany({
      where: {
        source: opts.source,
        excludeFromMatching: false,
        valueDate: { gte: opts.dateFrom, lte: opts.dateTo },
        match: { is: null },
      },
    });
    const payments = await this.prisma.feePayment.findMany({
      where: {
        status: FeePaymentRecordStatus.COMPLETED,
        OR: [
          { gatewayPaidAt: { gte: opts.dateFrom, lte: opts.dateTo } },
          { gatewayPaidAt: null, mmsReceivedAt: { gte: opts.dateFrom, lte: opts.dateTo } },
        ],
        reconciliationMatches: { none: {} },
      },
    });
    const matchedPaymentIds = new Set<string>();
    const counts: Record<string, number> = {};

    for (const external of externals) {
      const decision = decideMatch(
        external,
        payments.filter((payment) => !matchedPaymentIds.has(payment.id)),
        { softDays: opts.softDays, hardDays: opts.hardDays },
      );
      const confirmed = !!decision.paymentId;
      if (confirmed) matchedPaymentIds.add(decision.paymentId!);
      const payment = confirmed
        ? payments.find((candidate) => candidate.id === decision.paymentId)
        : undefined;
      const rule =
        opts.ruleOverride &&
        (decision.classification === ReconciliationClassification.MATCHED ||
          decision.classification === ReconciliationClassification.MATCHED_WITH_VARIANCE)
          ? opts.ruleOverride
          : decision.rule;

      await this.prisma.$transaction([
        this.prisma.reconciliationMatch.create({
          data: {
            runId: opts.runId,
            merchantId: payment?.merchantId ?? null,
            externalSettlementRecordId: external.id,
            feePaymentId: confirmed ? decision.paymentId : null,
            classification: decision.classification,
            rule,
            amountDelta: decision.amountDelta,
            dateDeltaHours: decision.dateDeltaHours,
            context: decision.candidatePaymentId
              ? { candidatePaymentId: decision.candidatePaymentId }
              : undefined,
          },
        }),
        this.prisma.externalSettlementRecord.update({
          where: { id: external.id },
          data: {
            classification: decision.classification,
            classificationMeta: {
              runId: opts.runId,
              rule,
              candidatePaymentId: decision.candidatePaymentId,
            },
          },
        }),
      ]);
      counts[decision.classification] = (counts[decision.classification] ?? 0) + 1;

      if (
        opts.openExceptions &&
        (decision.classification === ReconciliationClassification.DATE_VARIANCE_REVIEW ||
          decision.classification === ReconciliationClassification.AMOUNT_MISMATCH ||
          decision.classification === ReconciliationClassification.UNMATCHED_EXTERNAL)
      ) {
        await this.exceptions.upsertOpenCase({
          runId: opts.runId,
          merchantId: payment?.merchantId,
          classification: decision.classification,
          title: decision.classification.replace(/_/g, ' '),
          paymentIds: decision.paymentId
            ? [decision.paymentId]
            : decision.candidatePaymentId
              ? [decision.candidatePaymentId]
              : undefined,
          externalIds: [external.id],
          reference: external.paymentReference,
          createdBy: opts.actorId,
        });
      }
    }

    for (const payment of payments.filter((item) => !matchedPaymentIds.has(item.id))) {
      await this.prisma.reconciliationMatch.create({
        data: {
          runId: opts.runId,
          merchantId: payment.merchantId,
          feePaymentId: payment.id,
          classification: ReconciliationClassification.UNMATCHED_INTERNAL,
          rule: ReconciliationMatchRule.NONE,
        },
      });
      counts[ReconciliationClassification.UNMATCHED_INTERNAL] =
        (counts[ReconciliationClassification.UNMATCHED_INTERNAL] ?? 0) + 1;
      if (opts.openExceptions) {
        await this.exceptions.upsertOpenCase({
          runId: opts.runId,
          merchantId: payment.merchantId,
          classification: ReconciliationClassification.UNMATCHED_INTERNAL,
          title: 'Unmatched MMS payment',
          paymentIds: [payment.id],
          reference: payment.paymentReference,
          createdBy: opts.actorId,
        });
      }
    }

    return { counts, externalProcessed: externals.length };
  }

  private async createGroup(
    runId: string,
    merchantId: string | null | undefined,
    status: MatchGroupStatus,
    legs: Array<{
      legType: MatchGroupLegType;
      feePaymentId?: string | null;
      externalSettlementRecordId?: string | null;
      amount: Prisma.Decimal;
      currency: string;
      valueDate?: Date | null;
      paymentReference?: string | null;
    }>,
  ) {
    return this.prisma.reconciliationMatchGroup.create({
      data: {
        runId,
        merchantId: merchantId ?? undefined,
        status,
        legs: {
          create: legs.map((leg) => ({
            legType: leg.legType,
            feePaymentId: leg.feePaymentId ?? undefined,
            externalSettlementRecordId: leg.externalSettlementRecordId ?? undefined,
            amount: leg.amount,
            currency: leg.currency,
            valueDate: leg.valueDate ?? undefined,
            paymentReference: leg.paymentReference ?? undefined,
          })),
        },
      },
    });
  }

  async listRuns(source?: ExternalSettlementSource) {
    return this.prisma.reconciliationRun.findMany({
      where: { source },
      orderBy: { startedAt: 'desc' },
    });
  }

  async runDetail(id: string) {
    return this.prisma.reconciliationRun.findUniqueOrThrow({
      where: { id },
      include: {
        matches: {
          include: { payment: true, external: true },
          orderBy: { createdAt: 'asc' },
        },
        matchGroups: { include: { legs: true }, orderBy: { createdAt: 'asc' } },
        exceptionCases: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async schoolSummary(merchantId: string, dateFrom: Date, dateTo: Date) {
    const grouped = await this.prisma.reconciliationMatch.groupBy({
      by: ['classification'],
      where: {
        merchantId,
        run: {
          status: ReconciliationRunStatus.COMPLETED,
          dateFrom: { gte: dateFrom },
          dateTo: { lte: dateTo },
        },
      },
      _count: true,
    });
    const groups = await this.prisma.reconciliationMatchGroup.groupBy({
      by: ['status'],
      where: {
        merchantId,
        run: {
          status: ReconciliationRunStatus.COMPLETED,
          dateFrom: { gte: dateFrom },
          dateTo: { lte: dateTo },
        },
      },
      _count: true,
    });
    const openExceptions = await this.prisma.reconciliationExceptionCase.count({
      where: {
        merchantId,
        status: {
          in: ['OPEN', 'UNDER_INVESTIGATION', 'PENDING_APPROVAL', 'ESCALATED'],
        },
      },
    });
    return {
      classifications: Object.fromEntries(grouped.map((item) => [item.classification, item._count])),
      matchGroups: Object.fromEntries(groups.map((item) => [item.status, item._count])),
      openExceptions,
    };
  }
}
