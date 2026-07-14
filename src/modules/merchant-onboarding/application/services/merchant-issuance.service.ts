import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { MerchantAliasService } from '@modules/alias/application/services/merchant-alias.service';
import { QrRepository } from '@modules/qr/infrastructure/persistence/qr.repository';
import { QrValidators } from '@modules/qr/validators/qr.validators';

@Injectable()
export class MerchantIssuanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: MerchantAliasService,
    private readonly qrRepo: QrRepository,
    private readonly qrValidators: QrValidators,
  ) {}

  async issueMerchantAliasAndQr(merchantId: string, actorId: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { profile: true, acquirer: true, merchantAlias: true },
    });

    if (!merchant.profile?.city?.trim()) {
      throw new BadRequestException(
        'Merchant profile city is required before TANQR issuance',
      );
    }
    if (!merchant.profile?.postalCode) {
      throw new BadRequestException(
        'Merchant profile postal code is required before TANQR issuance',
      );
    }

    let alias = merchant.merchantAlias;
    if (!alias) {
      const issued = await this.aliasService.issueMerchantAlias(merchantId);
      alias = issued.alias;
    }

    const existingQr = await this.prisma.qrCode.findFirst({
      where: { merchantId, status: 'ACTIVE', qrType: 'STATIC' },
      include: { payloadVersions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    let qr = existingQr;
    if (!qr && alias) {
      const acquirerId5 = this.qrValidators.resolveAcquirerId5({
        acquirerTipsAcquirerId5: merchant.acquirer.tipsAcquirerId5,
      });
      const tipsParticipantCode =
        merchant.acquirer.tipsParticipantCode ?? acquirerId5.slice(-3);
      const { merchantId15 } = await this.qrValidators.ensureTipsRegistration(
        merchantId,
        acquirerId5,
        tipsParticipantCode,
      );
      qr = await this.qrRepo.createStaticQr({
        merchantId,
        merchantName: merchant.tradingName,
        city: merchant.profile.city,
        postalCode: merchant.profile.postalCode,
        mcc: merchant.mcc,
        merchantId15,
        storeLabel: alias.alias8digit,
        acquirerId5,
        createdBy: actorId,
      });
    }

    const qrPayload =
      qr?.payloadVersions?.[0]?.tlvPayload ?? existingQr?.payloadVersions?.[0]?.tlvPayload ?? null;

    const store = await this.prisma.merchantStore.upsert({
      where: {
        merchantId_storeCode: {
          merchantId,
          storeCode: 'MAIN',
        },
      },
      create: {
        merchantId,
        storeName: merchant.tradingName,
        storeCode: 'MAIN',
        terminalId: `T-${alias?.alias8digit ?? merchantId.slice(0, 8)}`,
        alias: alias?.alias8digit,
        upiHandle: alias ? `${alias.alias8digit}@letshego.tz` : null,
        qrString: qrPayload,
        status: alias && qr ? 'ACTIVE' : 'PENDING',
        createdBy: actorId,
      },
      update: {
        alias: alias?.alias8digit,
        upiHandle: alias ? `${alias.alias8digit}@letshego.tz` : null,
        qrString: qrPayload,
        status: alias && qr ? 'ACTIVE' : 'PENDING',
      },
    });

    return { alias, qr, store };
  }
}
