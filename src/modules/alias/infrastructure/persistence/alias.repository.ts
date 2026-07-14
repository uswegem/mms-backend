import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildEightDigitId, validateDamm } from '@shared/domain/alias/damm.util';
import { AliasBlock } from '@shared/domain/alias/alias.constants';

type Tx = Prisma.TransactionClient;

@Injectable()
export class AliasRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically claims the next 4-digit sequence slot within one of the given
   * blocks, trying them in the order passed and rolling over once a block's
   * 0000-9999 space is used up. The increment and the < 9999 guard live in
   * one UPDATE statement, so concurrent callers race on a Postgres row lock
   * per block, not a global lock, and never hand out a slot past a block's
   * capacity. Callers must pass the block set explicitly (e.g.
   * SCHOOL_ALIAS_BLOCKS vs MERCHANT_ALIAS_BLOCKS) — this method never infers
   * which blocks are allowed from context.
   */
  async allocateAliasSlot(
    blocks: readonly AliasBlock[],
    tx?: Tx,
  ): Promise<{ block: string; seq4: string }> {
    const client = tx ?? this.prisma;
    for (const block of blocks) {
      const rows = await client.$queryRaw<{ last_seq: number }[]>`
        UPDATE alias_block_sequences
        SET last_seq = last_seq + 1
        WHERE block = ${block} AND last_seq < 9999
        RETURNING last_seq
      `;
      if (rows.length > 0) {
        return { block, seq4: rows[0].last_seq.toString().padStart(4, '0') };
      }
    }
    throw new Error(
      `All allowed TANQR alias blocks (${blocks.join('/')}) are exhausted — provision a new block`,
    );
  }

  async generatePublicAlias(
    blocks: readonly AliasBlock[],
    tx?: Tx,
  ): Promise<{
    alias8digit: string;
    acquirerCode3: string;
    aliasSeq4: string;
    checksum1: string;
  }> {
    const { block, seq4 } = await this.allocateAliasSlot(blocks, tx);
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
