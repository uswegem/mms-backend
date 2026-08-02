import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildEightDigitId } from '@shared/domain/alias/damm.util';
import { MerchantAliasService } from '@modules/alias/application/services/merchant-alias.service';
import { QrRepository } from '@modules/qr/infrastructure/persistence/qr.repository';
import { QrValidators } from '@modules/qr/validators/qr.validators';

@Injectable()
export class SchoolIssuanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchantAlias: MerchantAliasService,
    private readonly qr: QrRepository,
    private readonly qrValidators: QrValidators,
  ) {}

  async onSchoolApprovedByApplication(
    applicationId: string,
    actorId: string,
  ): Promise<void> {
    const app = await this.prisma.onboardingApplication.findUnique({
      where: { id: applicationId },
      include: { merchant: { include: { profile: true, acquirer: true } } },
    });
    if (!app?.merchant.isSchool) return;

    if (!app.merchant.profile?.city?.trim()) {
      throw new BadRequestException(
        'Merchant profile city is required before TANQR issuance',
      );
    }
    if (!app.merchant.profile?.postalCode) {
      throw new BadRequestException(
        'Merchant profile postal code is required before TANQR issuance',
      );
    }

    const issued = await this.merchantAlias.issueMerchantAlias(app.merchantId);
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

    const acquirerId5 = this.qrValidators.resolveAcquirerId5({
      acquirerTipsAcquirerId5: app.merchant.acquirer.tipsAcquirerId5,
    });
    const tipsParticipantCode =
      app.merchant.acquirer.tipsParticipantCode ?? acquirerId5.slice(-3);
    const { merchantId15 } = await this.qrValidators.ensureTipsRegistration(
      app.merchantId,
      acquirerId5,
      tipsParticipantCode,
    );

    await this.qr.createStaticQr({
      merchantId: app.merchantId,
      merchantName: app.merchant.tradingName,
      city: app.merchant.profile.city,
      postalCode: app.merchant.profile.postalCode,
      mcc: app.merchant.mcc,
      merchantId15,
      storeLabel: alias.alias8digit,
      acquirerId5,
      internalRoutingId: internalId,
      createdBy: actorId,
    });
  }
}