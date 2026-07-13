import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * Allocates the 15-digit TANQR tag 26/02 Merchant ID: a 3-digit TIPS
 * participant code + a 12-digit zero-padded global sequence. Distinct from
 * the 8-digit Lipa Namba alias (tag 62/03) — do not conflate the two.
 */
@Injectable()
export class TipsMerchantIdRepository {
  constructor(private readonly prisma: PrismaService) {}

  async allocateMerchantId15(
    tipsParticipantCode: string,
    tx?: Tx,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const row = await client.tipsMerchantIdSequence.upsert({
      where: { id: 'GLOBAL' },
      update: { lastSeq: { increment: 1 } },
      create: { id: 'GLOBAL', lastSeq: 1 },
    });
    const code = tipsParticipantCode.padStart(3, '0').slice(-3);
    const seq = row.lastSeq.toString().padStart(12, '0');
    return `${code}${seq}`;
  }
}
