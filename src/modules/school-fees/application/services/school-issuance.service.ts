import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildEightDigitId } from '@shared/domain/alias/damm.util';
import { MerchantAliasService } from '@modules/alias/application/services/merchant-alias.service';
import { QrRepository } from '@modules/qr/infrastructure/persistence/qr.repository';

@Injectable()
export class SchoolIssuanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchantAlias: MerchantAliasService,
    private readonly qr: QrRepository,
  ) {}

  async onSchoolApprovedByApplication(
    applicationId: string,
    actorId: string,
  ): Promise<void> {
    const app = await this.prisma.onboardingApplication.findUnique({
      where: { id: applicationId },
      include: { merchant: { include: { profile: true } } },
    });
    if (!app?.merchant.isSchool) return;

    const issued = await this.merchantAlias.issueSchoolMerchantAlias(app.merchantId);
    const alias = issued.alias;
    const internalId =
      'internalId' in issued && issued.internalId
        ? issued.internalId
        : issued.schoolSeq
          ? buildEightDigitId(issued.schoolSeq.schoolSeq3, '0000')
          : undefined;

    const existingQr = await this.prisma.qrCode.findFirst({
      where: { merchantId: app.merchantId, studentId: null, status: 'ACTIVE' },
    });
    if (existingQr || !internalId) return;

    await this.qr.createStaticQr({
      merchantId: app.merchantId,
      merchantName: app.merchant.tradingName,
      city: app.merchant.profile?.city ?? 'Dar es Salaam',
      postalCode: app.merchant.profile?.postalCode ?? '11000',
      mcc: app.merchant.mcc,
      publicAlias: alias.alias8digit,
      internalRoutingId: internalId,
      createdBy: actorId,
    });
  }
}