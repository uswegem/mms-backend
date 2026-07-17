import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import {
  buildEightDigitId,
  buildTenDigitId,
  validateDamm,
} from '@shared/domain/alias/damm.util';
import { AliasBlock } from '@shared/domain/alias/alias.constants';

type Tx = Prisma.TransactionClient;

export class StudentAliasCapacityExceededException extends Error {
  constructor() {
    super(
      'Student alias capacity exhausted — maximum 999,999 student aliases reached',
    );
    this.name = 'StudentAliasCapacityExceededException';
  }
}

@Injectable()
export class AliasRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically claims the next 4-digit sequence slot within one of the given
   * blocks, trying them in the order passed and rolling over once a block's
   * 0000-9999 space is used up. Used for 8-digit merchant/school aliases only.
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

  /**
   * Atomically claims the next slot from the flat global student alias sequence
   * (single row in student_alias_sequences, cap 999,999).
   * Throws StudentAliasCapacityExceededException when the cap is reached.
   */
  async allocateStudentSlot(tx?: Tx): Promise<{ seq6: string }> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<{ last_seq: number }[]>`
      UPDATE student_alias_sequences
      SET last_seq = last_seq + 1
      WHERE id = 'GLOBAL' AND last_seq < 999999
      RETURNING last_seq
    `;
    if (rows.length === 0) {
      throw new StudentAliasCapacityExceededException();
    }
    return { seq6: rows[0].last_seq.toString().padStart(6, '0') };
  }

  /** Generate a 10-digit student alias ([780][seq6][check1]). */
  async generateStudentAlias(tx?: Tx): Promise<{
    alias10digit: string;
    acquirerCode3: string;
    aliasSeq6: string;
  }> {
    const { seq6 } = await this.allocateStudentSlot(tx);
    const alias10digit = buildTenDigitId(seq6);
    return { alias10digit, acquirerCode3: '780', aliasSeq6: seq6 };
  }

  async findMerchantAlias(merchantId: string) {
    return this.prisma.merchantAlias.findUnique({ where: { merchantId } });
  }

  /**
   * Look up an alias owner by alias string. Dispatches by length:
   * 8-digit strings search MerchantAlias; 10-digit strings search StudentAlias.
   */
  async findByAlias(alias: string) {
    if (alias.length === 8) {
      const merchantAlias = await this.prisma.merchantAlias.findUnique({
        where: { alias8digit: alias },
        include: { merchant: { include: { profile: true, school: true } } },
      });
      if (merchantAlias) return { type: 'merchant' as const, record: merchantAlias };
    }

    if (alias.length === 10) {
      const studentAlias = await this.prisma.studentAlias.findUnique({
        where: { alias10digit: alias },
        include: { student: true, merchant: { include: { profile: true } } },
      });
      if (studentAlias) return { type: 'student' as const, record: studentAlias };
    }

    return null;
  }

  validateAlias(alias: string): boolean {
    return validateDamm(alias);
  }
}
