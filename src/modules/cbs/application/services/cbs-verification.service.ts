import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

export interface CbsVerificationResult {
  result: 'PASS' | 'FAIL';
  accountName: string;
}

/**
 * CBS account verification stub — replace with real CBS enquiry in production.
 */
@Injectable()
export class CbsVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verifySettlementAccount(
    merchantId: string,
    accountNumber: string,
    accountName: string,
    verifiedBy: string,
  ): Promise<CbsVerificationResult> {
    const normalized = accountNumber.replace(/\s/g, '');
    const pass =
      normalized.length >= 10 &&
      normalized.length <= 20 &&
      /^[0-9]+$/.test(normalized) &&
      accountName.trim().length >= 2;

    const result: CbsVerificationResult = {
      result: pass ? 'PASS' : 'FAIL',
      accountName: pass ? accountName : '',
    };

    await this.prisma.cbsAccountVerification.create({
      data: {
        merchantId,
        accountNumber: normalized,
        result: result.result,
        verifiedBy,
      },
    });

    return result;
  }

  async latestVerification(merchantId: string, accountNumber: string) {
    return this.prisma.cbsAccountVerification.findFirst({
      where: { merchantId, accountNumber: accountNumber.replace(/\s/g, '') },
      orderBy: { verifiedAt: 'desc' },
    });
  }
}
