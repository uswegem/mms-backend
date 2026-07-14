import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildEightDigitId } from '@shared/domain/alias/damm.util';
import {
  MERCHANT_ALIAS_BLOCKS,
  SCHOOL_ALIAS_BLOCKS,
} from '@shared/domain/alias/alias.constants';
import { AliasRepository } from '@modules/alias/infrastructure/persistence/alias.repository';

type Tx = Prisma.TransactionClient;

@Injectable()
export class MerchantAliasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: AliasRepository,
  ) {}

  /** Issues a Lipa Namba alias from block 780, reserved for schools/students. */
  async issueSchoolAlias(merchantId: string) {
    const existing = await this.aliases.findMerchantAlias(merchantId);
    if (existing) {
      const schoolSeq = await this.prisma.schoolSequence.findUnique({
        where: { merchantId },
      });
      return { alias: existing, schoolSeq };
    }

    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const generated = await this.aliases.generatePublicAlias(SCHOOL_ALIAS_BLOCKS, tx);
      const alias = await tx.merchantAlias.create({
        data: {
          merchantId,
          alias8digit: generated.alias8digit,
          acquirerCode3: generated.acquirerCode3,
          merchantCode4: generated.aliasSeq4,
          checksum1: generated.checksum1,
          isSchool: true,
        },
      });

      const schoolSeq = await this.ensureSchoolSequence(tx, merchantId, merchant.acquirerId);
      const internalId = buildEightDigitId(schoolSeq.schoolSeq3, '0000');

      return { alias, schoolSeq, internalId };
    });
  }

  /** Issues a Lipa Namba alias from blocks 781/782, reserved for retail merchants. */
  async issueMerchantAlias(merchantId: string) {
    const existing = await this.aliases.findMerchantAlias(merchantId);
    if (existing) {
      return { alias: existing, schoolSeq: null };
    }

    return this.prisma.$transaction(async (tx) => {
      const generated = await this.aliases.generatePublicAlias(MERCHANT_ALIAS_BLOCKS, tx);
      const alias = await tx.merchantAlias.create({
        data: {
          merchantId,
          alias8digit: generated.alias8digit,
          acquirerCode3: generated.acquirerCode3,
          merchantCode4: generated.aliasSeq4,
          checksum1: generated.checksum1,
          isSchool: false,
        },
      });

      return { alias, schoolSeq: null };
    });
  }

  private async ensureSchoolSequence(tx: Tx, merchantId: string, acquirerId: string) {
    const existing = await tx.schoolSequence.findUnique({ where: { merchantId } });
    if (existing) return existing;

    const count = await tx.schoolSequence.count({
      where: { merchant: { acquirerId } },
    });
    const schoolSeq3 = (count + 1).toString().padStart(3, '0');
    return tx.schoolSequence.create({
      data: { merchantId, schoolSeq3, lastStudentSeq: 0 },
    });
  }

  async getMerchantAlias(merchantId: string) {
    const alias = await this.aliases.findMerchantAlias(merchantId);
    if (!alias) throw new NotFoundException('Merchant alias not issued');
    return alias;
  }

  async lookupAlias(alias8digit: string) {
    const result = await this.aliases.findByAlias8(alias8digit);
    if (!result) throw new NotFoundException('Alias not found');
    return result;
  }

  validateAlias(alias8digit: string) {
    return { valid: this.aliases.validateAlias(alias8digit) };
  }
}
