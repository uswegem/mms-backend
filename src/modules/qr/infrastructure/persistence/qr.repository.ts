import { Injectable } from '@nestjs/common';
import { Prisma, QrStatus, QrType } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { buildStaticTanqrPayload } from '@shared/domain/qr/tanqr-payload.builder';

export interface CreateStaticQrInput {
  merchantId: string;
  studentId?: string;
  merchantName: string;
  city: string;
  postalCode: string;
  mcc: string;
  publicAlias: string;
  internalRoutingId?: string;
  createdBy?: string;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class QrRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createStaticQr(input: CreateStaticQrInput, tx?: Tx) {
    const client = tx ?? this.prisma;
    const { tlvPayload, crcValue } = buildStaticTanqrPayload({
      merchantName: input.merchantName,
      city: input.city,
      postalCode: input.postalCode,
      mcc: input.mcc,
      publicAlias: input.publicAlias,
      internalRoutingId: input.internalRoutingId,
      poiMethod: '11',
    });

    return client.qrCode.create({
      data: {
        merchantId: input.merchantId,
        studentId: input.studentId,
        qrType: QrType.STATIC,
        status: QrStatus.ACTIVE,
        poiMethod: '11',
        createdBy: input.createdBy,
        payloadVersions: {
          create: {
            version: 1,
            tlvPayload,
            crcValue,
            tag26Alias: input.publicAlias,
            tag62InternalId: input.internalRoutingId,
          },
        },
      },
      include: { payloadVersions: true },
    });
  }

  async findById(id: string) {
    return this.prisma.qrCode.findUnique({
      where: { id },
      include: { payloadVersions: { orderBy: { version: 'desc' }, take: 1 } },
    });
  }

  async listByMerchant(merchantId: string) {
    return this.prisma.qrCode.findMany({
      where: { merchantId, status: QrStatus.ACTIVE },
      include: { payloadVersions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
