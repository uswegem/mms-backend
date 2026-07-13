import { Injectable } from '@nestjs/common';
import { Prisma, QrStatus, QrType } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import {
  buildStaticTanqrPayload,
  verifyTanqrCrc,
} from '../../domain/tanqr-payload.builder';
import type { StoredQrAsset } from '../../application/services/qr-storage.service';
import { QrValidators } from '../../validators/qr.validators';

export interface CreateStaticQrInput {
  merchantId: string;
  studentId?: string;
  merchantName: string;
  city: string;
  postalCode: string;
  mcc: string;
  /** Bank-assigned Merchant ID (up to 15 digits) — TANQR tag 26/02. */
  merchantId15: string;
  acquirerId5: string;
  /** 8-digit Lipa Namba alias — TANQR tag 62/03 (Store Label). */
  storeLabel?: string;
  internalRoutingId?: string;
  createdBy?: string;
}

export interface PersistQrInput {
  merchantId: string;
  studentId?: string;
  storeId?: string;
  terminalId?: string;
  qrType: QrType;
  poiMethod: '11' | '12';
  createdBy?: string;
  existingQrId?: string;
  version: number;
  tlvPayload: string;
  crcValue: string;
  tag26MerchantId: string;
  tag62StoreLabel?: string;
  tag62InternalId?: string;
  amount?: string;
  billNumber?: string;
  referenceLabel?: string;
  expiresAt?: Date;
  purpose?: string;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class QrRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validators: QrValidators,
  ) {}

  async createStaticQr(input: CreateStaticQrInput, tx?: Tx) {
    const client = tx ?? this.prisma;
    const merchantName = this.validators.sanitizeMerchantName(input.merchantName);
    const city = this.validators.sanitizeCity(input.city);
    const postalCode = this.validators.validatePostalCode(input.postalCode);
    const mcc = this.validators.validateMcc(input.mcc);

    const { tlvPayload, crcValue } = buildStaticTanqrPayload({
      merchantName,
      city,
      postalCode,
      mcc,
      merchantId: input.merchantId15,
      acquirerId5: input.acquirerId5,
      storeLabel: input.storeLabel,
      internalRoutingId: input.internalRoutingId,
      poiMethod: '11',
    });

    if (!verifyTanqrCrc(tlvPayload, crcValue)) {
      throw new Error(
        'TANQR CRC self-check failed — refusing to persist a corrupted payload',
      );
    }

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
            tag26MerchantId: input.merchantId15,
            tag62StoreLabel: input.storeLabel,
            tag62InternalId: input.internalRoutingId,
          },
        },
      },
      include: { payloadVersions: true },
    });
  }

  async findActiveStaticQr(
    merchantId: string,
    storeId?: string,
    terminalId?: string,
  ) {
    return this.prisma.qrCode.findFirst({
      where: {
        merchantId,
        qrType: QrType.STATIC,
        status: QrStatus.ACTIVE,
        storeId: storeId ?? null,
        terminalId: terminalId ?? null,
      },
      include: {
        payloadVersions: { orderBy: { version: 'desc' }, take: 1 },
        renderAssets: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async persistQrGeneration(input: PersistQrInput): Promise<{
    id: string;
    status: QrStatus;
    payloadVersionId: string;
  }> {
    if (!verifyTanqrCrc(input.tlvPayload, input.crcValue)) {
      throw new Error(
        'TANQR CRC self-check failed — refusing to persist a corrupted payload',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let qrId = input.existingQrId;

      if (qrId) {
        await tx.qrCode.update({
          where: { id: qrId },
          data: { currentVersion: input.version },
        });
      } else {
        const created = await tx.qrCode.create({
          data: {
            merchantId: input.merchantId,
            studentId: input.studentId,
            storeId: input.storeId,
            terminalId: input.terminalId,
            qrType: input.qrType,
            status: QrStatus.ACTIVE,
            poiMethod: input.poiMethod,
            currentVersion: input.version,
            expiresAt: input.expiresAt,
            createdBy: input.createdBy,
          },
        });
        qrId = created.id;
      }

      const payloadVersion = await tx.qrPayloadVersion.create({
        data: {
          qrId,
          version: input.version,
          tlvPayload: input.tlvPayload,
          crcValue: input.crcValue,
          tag26MerchantId: input.tag26MerchantId,
          tag62StoreLabel: input.tag62StoreLabel,
          tag62InternalId: input.tag62InternalId,
          amount: input.amount ? new Prisma.Decimal(input.amount) : undefined,
          billNumber: input.billNumber,
          referenceLabel: input.referenceLabel,
        },
      });

      return {
        id: qrId,
        status: QrStatus.ACTIVE,
        payloadVersionId: payloadVersion.id,
      };
    });
  }

  async saveRenderAssets(
    qrId: string,
    payloadVersionId: string,
    assets: StoredQrAsset[],
    bucket: string,
  ): Promise<void> {
    await this.prisma.qrRenderAsset.createMany({
      data: assets.map((asset) => ({
        qrId,
        payloadVersionId,
        format: asset.format,
        s3Bucket: bucket,
        s3Key: asset.storagePath,
        fileHash: asset.fileHash,
        width: asset.width,
        height: asset.height,
        sizeBytes: asset.sizeBytes,
      })),
    });
  }

  async getRenderAsset(
    qrId: string,
    version: number,
    format: 'png' | 'svg',
  ) {
    const payloadVersion = await this.prisma.qrPayloadVersion.findUnique({
      where: { qrId_version: { qrId, version } },
    });
    if (!payloadVersion) return null;

    return this.prisma.qrRenderAsset.findFirst({
      where: {
        qrId,
        payloadVersionId: payloadVersion.id,
        format,
      },
    });
  }

  async getAssetUrls(qrId: string, version: number): Promise<{ png?: string; svg?: string }> {
    const payloadVersion = await this.prisma.qrPayloadVersion.findUnique({
      where: { qrId_version: { qrId, version } },
    });
    if (!payloadVersion) return {};

    const assets = await this.prisma.qrRenderAsset.findMany({
      where: { qrId, payloadVersionId: payloadVersion.id },
    });

    const map: { png?: string; svg?: string } = {};
    for (const asset of assets) {
      const url = `/storage/${asset.s3Key.replace(/\\/g, '/')}`;
      if (asset.format === 'png') map.png = url;
      if (asset.format === 'svg') map.svg = url;
    }
    return map;
  }

  async findById(id: string) {
    return this.prisma.qrCode.findUnique({
      where: { id },
      include: {
        payloadVersions: { orderBy: { version: 'desc' }, take: 1 },
        renderAssets: true,
      },
    });
  }

  async listByMerchant(merchantId: string) {
    return this.listAllForMerchant(merchantId);
  }

  async listAllForMerchant(merchantId: string) {
    return this.prisma.qrCode.findMany({
      where: { merchantId },
      include: {
        payloadVersions: { orderBy: { version: 'desc' }, take: 1 },
        student: {
          select: { id: true, fullName: true, admissionNo: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async disableQr(qrId: string) {
    return this.prisma.qrCode.update({
      where: { id: qrId },
      data: {
        status: QrStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
  }

  async findQrForMerchant(qrId: string, merchantId: string) {
    return this.prisma.qrCode.findFirst({
      where: { id: qrId, merchantId },
      include: { payloadVersions: { orderBy: { version: 'desc' }, take: 1 } },
    });
  }
}
