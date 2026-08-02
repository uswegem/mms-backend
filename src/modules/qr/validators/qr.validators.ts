import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MerchantStatus, Prisma, QrType } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { TipsMerchantIdRepository } from '../domain/tips-merchant-id.repository';
import { VALID_LIPA_NAMBA_BLOCKS } from '@shared/domain/alias/alias.constants';

const ANS_PATTERN = /^[A-Za-z0-9 .,\-]*$/;

type Tx = Prisma.TransactionClient;

export interface MerchantQrContext {
  merchant: {
    id: string;
    acquirerId: string;
    status: MerchantStatus;
    mcc: string;
    tradingName: string;
    deletedAt: Date | null;
    isSchool: boolean;
  };
  profile: { city: string; postalCode: string };
  /** 8-digit Lipa Namba alias (AAA-CCCC-S) — TANQR tag 62/03. */
  alias: string;
  /** Bank-assigned Merchant ID, up to 15 digits — TANQR tag 26/02. */
  merchantId15: string;
  acquirerId5: string;
  tipsRegistered: boolean;
}

@Injectable()
export class QrValidators {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tipsIdRepo: TipsMerchantIdRepository,
  ) {}

  /**
   * Resolves the TANQR 5-digit Acquirer ID for a merchant from whatever source
   * has it, throwing rather than silently defaulting — a wrong acquirer ID
   * misroutes real money, so there is no safe fallback value.
   */
  resolveAcquirerId5(params: {
    tipsRegistrationAcquirerId5?: string | null;
    acquirerTipsAcquirerId5?: string | null;
    tpsResponsePayload?: unknown;
  }): string {
    const fromResponse = (
      params.tpsResponsePayload as { acquirerId5?: string } | null
    )?.acquirerId5;
    const acquirerId5 =
      params.tipsRegistrationAcquirerId5 ??
      params.acquirerTipsAcquirerId5 ??
      fromResponse;
    if (!acquirerId5) {
      throw new BadRequestException(
        'TIPS registration data (acquirer ID) is not available locally for this merchant',
      );
    }
    return acquirerId5;
  }

  /**
   * Ensures a TipsRegistration row exists for the merchant, allocating a
   * permanent 15-digit Merchant ID (tag 26/02) the first time — never
   * reassigned afterwards. Callable independently of validateMerchantForQr
   * since issuance services need this before a merchant alias exists.
   */
  async ensureTipsRegistration(
    merchantId: string,
    acquirerId5: string,
    tipsParticipantCode: string,
    tx?: Tx,
  ): Promise<{ acquirerId5: string; merchantId15: string }> {
    const client = tx ?? this.prisma;
    const existing = await client.tipsRegistration.findUnique({
      where: { merchantId },
    });
    if (existing) {
      return {
        acquirerId5: existing.acquirerId5,
        merchantId15: existing.merchantId15,
      };
    }
    const merchantId15 = await this.tipsIdRepo.allocateMerchantId15(
      tipsParticipantCode,
      tx,
    );
    const created = await client.tipsRegistration.create({
      data: { merchantId, acquirerId5, merchantId15, status: 'PENDING' },
    });
    return { acquirerId5: created.acquirerId5, merchantId15: created.merchantId15 };
  }

  validateQrType(type: string): QrType {
    const normalized = type.toUpperCase();
    if (normalized !== 'STATIC' && normalized !== 'DYNAMIC') {
      throw new BadRequestException('qr_type must be static or dynamic');
    }
    return normalized as QrType;
  }

  validatePoiMethod(method: string): '11' | '12' {
    if (method !== '11' && method !== '12') {
      throw new BadRequestException('poi_method must be 11 (static) or 12 (dynamic)');
    }
    return method;
  }

  validateMcc(mcc: string, allowUnavailable = false): string {
    const normalized = mcc.replace(/\D/g, '').padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(normalized)) {
      throw new BadRequestException('Merchant MCC must be a valid 4-digit code');
    }
    if (normalized === '0000' && !allowUnavailable) {
      throw new BadRequestException(
        'Merchant MCC must be set; use 0000 only when unavailable',
      );
    }
    return normalized;
  }

  validatePostalCode(postalCode: string): string {
    const digits = postalCode.replace(/\D/g, '');
    if (!/^\d{5}$/.test(digits)) {
      throw new BadRequestException('Postal code must be exactly 5 numeric digits');
    }
    return digits;
  }

  validateTlvLength(value: string): void {
    if (value.length < 1 || value.length > 99) {
      throw new BadRequestException(
        `TLV value length must be between 1 and 99 characters (got ${value.length})`,
      );
    }
  }

  sanitizeMerchantName(name: string): string {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    const sanitized = trimmed
      .split('')
      .filter((ch) => ANS_PATTERN.test(ch))
      .join('');
    if (!sanitized) {
      throw new BadRequestException('Merchant name is required for TANQR');
    }
    return sanitized.slice(0, 25);
  }

  sanitizeCity(city: string): string {
    const trimmed = city.trim().replace(/\s+/g, ' ');
    const sanitized = trimmed
      .split('')
      .filter((ch) => ANS_PATTERN.test(ch))
      .join('');
    if (!sanitized) {
      throw new BadRequestException('Merchant city is required for TANQR');
    }
    return sanitized.slice(0, 15);
  }

  validateAmount(amount: string | number): string {
    const raw =
      typeof amount === 'number'
        ? amount.toString()
        : amount.replace(/,/g, '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      throw new BadRequestException(
        'Amount must be a positive number with at most 2 decimal places',
      );
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (raw.replace('.', '').length > 13) {
      throw new BadRequestException('Amount must not exceed 13 characters');
    }
    return raw;
  }

  async validateMerchantForQr(merchantId: string): Promise<MerchantQrContext> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        profile: true,
        merchantAlias: true,
        acquirer: true,
        integrations: {
          where: { integrationType: 'TPS' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    if (merchant.deletedAt) {
      throw new BadRequestException('Merchant has been deleted');
    }
    if (merchant.status !== MerchantStatus.ACTIVE) {
      throw new BadRequestException(
        `Merchant status ${merchant.status} is not eligible for QR generation`,
      );
    }
    if (!merchant.tradingName?.trim()) {
      throw new BadRequestException('Merchant trading name is required');
    }
    if (!merchant.profile?.city?.trim()) {
      throw new BadRequestException('Merchant profile city is required');
    }
    if (!merchant.profile.postalCode) {
      throw new BadRequestException('Merchant profile postal code is required');
    }

    this.validateMcc(merchant.mcc);
    this.validatePostalCode(merchant.profile.postalCode);

    const aliasRow = merchant.merchantAlias;
    if (!aliasRow?.isActive || !aliasRow.alias8digit) {
      throw new BadRequestException(
        'Active merchant alias / Lipa Namba is required before QR generation',
      );
    }

    const aliasBlock = aliasRow.alias8digit.slice(0, 3);
    if (!(VALID_LIPA_NAMBA_BLOCKS as readonly string[]).includes(aliasBlock)) {
      throw new BadRequestException(
        'Merchant Lipa Namba must start with block 780 (school), 781, or 782',
      );
    }
    if (merchant.isSchool && aliasBlock !== '780') {
      throw new BadRequestException(
        'School merchants must use Lipa Namba block 780',
      );
    }
    if (!merchant.isSchool && aliasBlock === '780') {
      throw new BadRequestException(
        'Non-school merchants must use Lipa Namba block 781 or 782',
      );
    }

    const tipsRegistration = await this.prisma.tipsRegistration.findUnique({
      where: { merchantId },
    }).catch(() => null);

    const tpsIntegration = merchant.integrations[0];
    const acquirerId5 = this.resolveAcquirerId5({
      tipsRegistrationAcquirerId5: tipsRegistration?.acquirerId5,
      acquirerTipsAcquirerId5: merchant.acquirer.tipsAcquirerId5,
      tpsResponsePayload: tpsIntegration?.responsePayload,
    });

    const tipsParticipantCode =
      merchant.acquirer.tipsParticipantCode ?? acquirerId5.slice(-3);
    const { merchantId15 } = await this.ensureTipsRegistration(
      merchantId,
      acquirerId5,
      tipsParticipantCode,
    );

    return {
      merchant: {
        id: merchant.id,
        acquirerId: merchant.acquirerId,
        status: merchant.status,
        mcc: merchant.mcc,
        tradingName: merchant.tradingName,
        deletedAt: merchant.deletedAt,
        isSchool: merchant.isSchool,
      },
      profile: {
        city: merchant.profile.city,
        postalCode: merchant.profile.postalCode,
      },
      alias: aliasRow.alias8digit,
      merchantId15,
      acquirerId5,
      tipsRegistered:
        tipsRegistration?.status === 'REGISTERED' ||
        tpsIntegration?.status === 'SUCCESS',
    };
  }
}
