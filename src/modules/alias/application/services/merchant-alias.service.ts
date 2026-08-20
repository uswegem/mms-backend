import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildEightDigitId } from '@shared/domain/alias/damm.util';
import {
  LIPA_NAMBA_BLOCKS,
  type LipaNambaBlock,
} from '@shared/domain/alias/alias.constants';
import { AliasRepository } from '@modules/alias/infrastructure/persistence/alias.repository';

type Tx = Prisma.TransactionClient;

const MAX_ALIAS_ISSUE_ATTEMPTS = 5;

function isUniqueAliasConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray((err.meta as { target?: unknown })?.target) &&
    ((err.meta as { target?: string[] }).target ?? []).includes('alias_8digit')
  );
}

@Injectable()
export class MerchantAliasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: AliasRepository,
  ) {}

  /** Issue Lipa Namba: 780 for schools, 781/782 for other merchants. */
  async issueMerchantAlias(merchantId: string) {
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

    const block = merchant.isSchool
      ? LIPA_NAMBA_BLOCKS.SCHOOL
      : await this.aliases.resolveMerchantBlock();
    const alias = await this.createAliasWithRetry(
      merchantId,
      block,
      merchant.isSchool,
    );

    let schoolSeq = null;
    let internalId: string | undefined;
    if (merchant.isSchool) {
      schoolSeq = await this.prisma.$transaction((tx) =>
        this.ensureSchoolSequence(tx, merchantId, merchant.acquirerId),
      );
      internalId = buildEightDigitId(schoolSeq.schoolSeq3, '0000');
    }

    return { alias, schoolSeq, internalId };
  }

  /**
   * Claims the next sequence number for `block` and inserts the alias row,
   * retrying on a unique-constraint collision.
   *
   * Deliberately does NOT wrap the counter bump and the insert in one shared
   * transaction: each `generatePublicAlias` call commits its sequence
   * increment immediately via `this.prisma` (no tx passed through), so a
   * failed insert below can never roll the counter back. Without this, a
   * single stale/desynced counter reproduces the exact same colliding alias
   * on every retry forever (see the ALIAS_QR_FAILED incident on
   * ONB-2026-000016 — block 780's counter was missing entirely and kept
   * regenerating an alias already taken by another merchant).
   */
  private async createAliasWithRetry(
    merchantId: string,
    block: LipaNambaBlock,
    isSchool: boolean,
  ) {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ALIAS_ISSUE_ATTEMPTS; attempt++) {
      const generated = await this.aliases.generatePublicAlias(
        undefined,
        block,
      );
      try {
        return await this.prisma.merchantAlias.create({
          data: {
            merchantId,
            alias8digit: generated.alias8digit,
            acquirerCode3: generated.acquirerCode3,
            merchantCode4: generated.aliasSeq4,
            checksum1: generated.checksum1,
            isSchool,
          },
        });
      } catch (err) {
        if (isUniqueAliasConflict(err)) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(
          `Failed to issue a unique Lipa Namba alias for block ${block} after ${MAX_ALIAS_ISSUE_ATTEMPTS} attempts`,
        );
  }

  /** @deprecated Use issueMerchantAlias — school sequences are only created when isSchool. */
  async issueSchoolMerchantAlias(merchantId: string) {
    return this.issueMerchantAlias(merchantId);
  }

  private async ensureSchoolSequence(
    tx: Tx,
    merchantId: string,
    acquirerId: string,
  ) {
    const existing = await tx.schoolSequence.findUnique({
      where: { merchantId },
    });
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

  async lookupAlias(alias: string) {
    const result = await this.aliases.findByAlias(alias);
    if (!result) throw new NotFoundException('Alias not found');
    return result;
  }

  validateAlias(alias: string) {
    return { valid: this.aliases.validateAlias(alias) };
  }
}
