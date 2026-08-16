import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ExternalSettlementSource, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

const TIPS_COLUMNS = [
  'source',
  'external_txn_id',
  'payment_reference',
  'amount',
  'currency',
  'value_date',
  'payer_msisdn',
  'payer_name',
  'status',
] as const;

const CBS_COLUMNS = [
  'source',
  'external_txn_id',
  'tips_txn_id',
  'payment_reference',
  'amount',
  'currency',
  'value_date',
  'credit_account',
  'narration',
  'status',
] as const;

type Spec = 'TIPS' | 'CBS';

type ValidRow = {
  source: ExternalSettlementSource;
  externalTxnId: string;
  tipsTxnId?: string | null;
  paymentReference?: string | null;
  amount: Prisma.Decimal;
  currency: string;
  valueDate: Date;
  payerMsisdn?: string | null;
  payerName?: string | null;
  creditAccount?: string | null;
  narration?: string | null;
  status?: string | null;
  raw: Record<string, string>;
};

@Injectable()
export class SettlementIngestionService {
  constructor(private readonly prisma: PrismaService) {}

  detectSpec(header: string[]): Spec {
    const joined = header.join(',');
    if (joined === TIPS_COLUMNS.join(',')) return 'TIPS';
    if (joined === CBS_COLUMNS.join(',')) return 'CBS';
    throw new BadRequestException(
      `CSV columns must be TIPS (${TIPS_COLUMNS.join(',')}) or CBS (${CBS_COLUMNS.join(',')})`,
    );
  }

  parseCsv(text: string): { spec: Spec; rows: Record<string, string>[] } {
    const rows = this.parseRows(text);
    if (!rows.length) throw new BadRequestException('CSV is empty');
    const header = rows.shift()!.map((value) => value.trim().toLowerCase());
    const spec = this.detectSpec(header);
    const columns = spec === 'TIPS' ? TIPS_COLUMNS : CBS_COLUMNS;
    return {
      spec,
      rows: rows
        .filter((row) => row.some(Boolean))
        .map(
          (row) =>
            Object.fromEntries(columns.map((column, index) => [column, (row[index] ?? '').trim()])) as Record<
              string,
              string
            >,
        ),
    };
  }

  async ingestCsv(fileName: string, content: Buffer | string, actorId: string) {
    const text = Buffer.isBuffer(content) ? content.toString('utf8') : content;
    const fileHash = createHash('sha256').update(text).digest('hex');
    const prior = await this.prisma.settlementIngestBatch.findUnique({ where: { fileHash } });
    if (prior) {
      return {
        batch: prior,
        accepted: 0,
        rejected: 0,
        skipped: prior.accepted + prior.rejected,
        idempotent: true,
      };
    }

    const { spec, rows: parsed } = this.parseCsv(text);
    const valid: ValidRow[] = [];
    const rejected: Array<{ row: number; reason: string }> = [];

    parsed.forEach((row, index) => {
      try {
        if (!Object.values(ExternalSettlementSource).includes(row.source as ExternalSettlementSource)) {
          throw new Error('invalid source');
        }
        if (spec === 'TIPS' && row.source !== ExternalSettlementSource.TIPS) {
          throw new Error('TIPS file must use source=TIPS');
        }
        if (spec === 'CBS' && row.source !== ExternalSettlementSource.CBS) {
          throw new Error('CBS file must use source=CBS');
        }
        if (!row.external_txn_id || !row.amount || !row.value_date) {
          throw new Error('external_txn_id, amount and value_date are required');
        }
        const amount = new Prisma.Decimal(row.amount);
        const valueDate = new Date(row.value_date);
        if (!amount.gt(0) || Number.isNaN(valueDate.getTime())) {
          throw new Error('amount must be positive and value_date valid');
        }
        valid.push({
          source: row.source as ExternalSettlementSource,
          externalTxnId: row.external_txn_id,
          tipsTxnId: row.tips_txn_id || null,
          paymentReference: row.payment_reference || null,
          amount,
          currency: row.currency || 'TZS',
          valueDate,
          payerMsisdn: row.payer_msisdn || null,
          payerName: row.payer_name || null,
          creditAccount: row.credit_account || null,
          narration: row.narration || null,
          status: row.status || null,
          raw: row,
        });
      } catch (error) {
        rejected.push({
          row: index + 2,
          reason: error instanceof Error ? error.message : 'invalid row',
        });
      }
    });

    const source = valid[0]?.source ?? (spec === 'CBS' ? ExternalSettlementSource.CBS : ExternalSettlementSource.TIPS);
    if (valid.some((row) => row.source !== source)) {
      throw new BadRequestException('A settlement file may contain one source only');
    }

    const batch = await this.prisma.settlementIngestBatch.create({
      data: { source, fileName, fileHash, createdBy: actorId },
    });

    let accepted = 0;
    let skipped = 0;
    for (const row of valid) {
      try {
        await this.prisma.externalSettlementRecord.create({
          data: {
            ingestBatchId: batch.id,
            source: row.source,
            externalTxnId: row.externalTxnId,
            tipsTxnId: row.tipsTxnId,
            paymentReference: row.paymentReference,
            amount: row.amount,
            currency: row.currency,
            valueDate: row.valueDate,
            payerMsisdn: row.payerMsisdn,
            payerName: row.payerName,
            creditAccount: row.creditAccount,
            narration: row.narration,
            externalStatus: row.status,
            rawPayload: row.raw as unknown as Prisma.InputJsonValue,
          },
        });
        accepted++;
      } catch (error) {
        if (this.isUnique(error)) skipped++;
        else {
          rejected.push({
            row: 0,
            reason: error instanceof Error ? error.message : 'unable to create record',
          });
        }
      }
    }

    const report = { accepted, rejected, skipped, spec };
    const updated = await this.prisma.settlementIngestBatch.update({
      where: { id: batch.id },
      data: {
        accepted,
        rejected: rejected.length,
        skipped,
        report: report as Prisma.InputJsonValue,
      },
    });
    return { batch: updated, ...report, idempotent: false };
  }

  async listBatches() {
    return this.prisma.settlementIngestBatch.findMany({ orderBy: { createdAt: 'desc' } });
  }

  private parseRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(value);
        value = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(value);
        rows.push(row);
        row = [];
        value = '';
      } else value += char;
    }
    if (value.length || row.length) {
      row.push(value);
      rows.push(row);
    }
    return rows;
  }

  private isUnique(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
