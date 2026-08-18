import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { CbsValidationProvider } from '../ports/cbs-validation.port';

export interface CbsVerificationResult {
  result: 'PASS' | 'FAIL';
  accountName: string;
}

/**
 * Orchestrates CBS settlement-account validation (Scope §3 CBS function
 * #1, brief §4.3 Step 5): calls the swappable CbsValidationProvider port
 * for the actual check, then owns persisting the attempt and querying
 * prior verifications — the same split as IdentityVerificationService /
 * NidaVerificationProvider in the onboarding module.
 */
@Injectable()
export class CbsVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CbsValidationProvider,
  ) {}

  async verifySettlementAccount(
    merchantId: string,
    accountNumber: string,
    accountName: string,
    verifiedBy: string,
  ): Promise<CbsVerificationResult> {
    const normalized = accountNumber.replace(/\s/g, '');
    const outcome = await this.validation.verify(normalized, accountName);

    const result: CbsVerificationResult = {
      result: outcome.result,
      accountName: outcome.result === 'PASS' ? accountName : '',
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
