import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildEightDigitId, validateDamm } from '@shared/domain/alias/damm.util';
import {
  LIPA_NAMBA_BLOCKS,
  type LipaNambaBlock,
} from '@shared/domain/alias/alias.constants';

type Tx = Prisma.TransactionClient;

const MAX_SEQ4 = 9999;

@Injectable()
export class AliasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async nextSeq4ForBlock(block: LipaNambaBlock, tx?: Tx): Promise<string> {
    const client = tx ?? this.prisma;
    const row = await client.globalAliasSequence.upsert({
      where: { id: `BLOCK_${block}` },
      update: { lastSeq: { increment: 1 } },
      create: { id: `BLOCK_${block}`, lastSeq: 1 },
    });
    if (row.lastSeq > MAX_SEQ4) {
      throw new Error(`Lipa Namba block ${block} sequence exhausted`);
    }
    return row.lastSeq.toString().padStart(4, '0');
  }

  /**
   * Prefer 781 for merchants; when 781 is full, use 782.
   */
  async resolveMerchantBlock(tx?: Tx): Promise<LipaNambaBlock> {
    const client = tx ?? this.prisma;
    const primary = await client.globalAliasSequence.findUnique({
      where: { id: `BLOCK_${LIPA_NAMBA_BLOCKS.MERCHANT_PRIMARY}` },
    });
    if (!primary || primary.lastSeq < MAX_SEQ4) {
      return LIPA_NAMBA_BLOCKS.MERCHANT_PRIMARY;
    }
    return LIPA_NAMBA_BLOCKS.MERCHANT_SECONDARY;
  }

  async generatePublicAlias(
    tx?: Tx,
    block: LipaNambaBlock = LIPA_NAMBA_BLOCKS.SCHOOL,
  ): Promise<{
    alias8digit: string;
    acquirerCode3: string;
    aliasSeq4: string;
    checksum1: string;
  }> {
    const seq4 = await this.nextSeq4ForBlock(block, tx);
    const alias8digit = buildEightDigitId(block, seq4);
    return {
      alias8digit,
      acquirerCode3: block,
      aliasSeq4: seq4,
      checksum1: alias8digit[7],
    };
  }

  async findMerchantAlias(merchantId: string) {
    return this.prisma.merchantAlias.findUnique({ where: { merchantId } });
  }

  async findByAlias8(alias8digit: string) {
    const merchantAlias = await this.prisma.merchantAlias.findUnique({
      where: { alias8digit },
      include: { merchant: { include: { profile: true, school: true } } },
    });
    if (merchantAlias) return { type: 'merchant' as const, record: merchantAlias };

    const studentAlias = await this.prisma.studentAlias.findUnique({
      where: { alias8digit },
      include: { student: true, merchant: { include: { profile: true } } },
    });
    if (studentAlias) return { type: 'student' as const, record: studentAlias };
    return null;
  }

  validateAlias(alias8digit: string): boolean {
    return validateDamm(alias8digit);
  }
}
