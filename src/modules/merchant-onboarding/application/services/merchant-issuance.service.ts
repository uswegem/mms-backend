import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { MerchantAliasService } from '@modules/alias/application/services/merchant-alias.service';
import { QrRepository } from '@modules/qr/infrastructure/persistence/qr.repository';

@Injectable()
export class MerchantIssuanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: MerchantAliasService,
    private readonly qrRepo: QrRepository,
  ) {}

  async issueMerchantAliasAndQr(merchantId: string, actorId: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { merchantAlias: true, profile: true },
    });

    let alias = merchant.merchantAlias;
    if (!alias) {
      const issued = await this.aliasService.issueSchoolMerchantAlias(merchantId);
      alias = issued.alias;
    }

    const existingQr = await this.prisma.qrCode.findFirst({
      where: { merchantId, status: 'ACTIVE', qrType: 'STATIC' },
      include: { payloadVersions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    let qr = existingQr;
    if (!qr && alias) {
      qr = await this.qrRepo.createStaticQr({
        merchantId,
        merchantName: merchant.tradingName,
        city: merchant.profile?.city ?? 'Dar es Salaam',
        postalCode: merchant.profile?.postalCode ?? '00000',
        mcc: merchant.mcc,
        publicAlias: alias.alias8digit,
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
