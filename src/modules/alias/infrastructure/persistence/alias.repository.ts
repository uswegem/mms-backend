import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildEightDigitId, validateDamm } from '@shared/domain/alias/damm.util';
import { LIPA_NAMBA_PREFIX } from '@shared/domain/alias/alias.constants';

type Tx = Prisma.TransactionClient;

@Injectable()
export class AliasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async nextGlobalSeq4(tx?: Tx): Promise<string> {
    const client = tx ?? this.prisma;
    const row = await client.globalAliasSequence.upsert({
      where: { id: 'GLOBAL' },
      update: { lastSeq: { increment: 1 } },
      create: { id: 'GLOBAL', lastSeq: 1 },
    });
    return row.lastSeq.toString().padStart(4, '0');
  }

  async generatePublicAlias(tx?: Tx): Promise<{
    alias8digit: string;
    acquirerCode3: string;
    aliasSeq4: string;
    checksum1: string;
  }> {
    const seq4 = await this.nextGlobalSeq4(tx);
    const alias8digit = buildEightDigitId(LIPA_NAMBA_PREFIX, seq4);
    return {
      alias8digit,
      acquirerCode3: LIPA_NAMBA_PREFIX,
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
