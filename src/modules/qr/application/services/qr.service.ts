import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QrStatus, QrType } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { MerchantScopeService } from '@modules/merchants/application/services/merchant-scope.service';
import { buildTanqrPayload } from '../../domain/tanqr-payload.builder';
import { QrRepository } from '../../infrastructure/persistence/qr.repository';
import { QrValidators } from '../../validators/qr.validators';
import { QrRendererService } from './qr-renderer.service';
import { QrStorageService } from './qr-storage.service';
import { QrAnnex2DisplayService } from './qr-annex2-display.service';
import { QrPayloadValidatorService } from './qr-payload-validator.service';
import { extractTag62SubTag } from '../../domain/tlv.parser';

export interface QrAssetMap {
  png?: string;
  svg?: string;
}

export interface StaticQrResult {
  success: true;
  qr_id: string;
  qr_type: 'static';
  poi_method: '11';
  status: string;
  version: number;
  merchant_id: string;
  alias: string;
  /** Fixed amount baked into the payload (tag 54), if any — a static QR with
   * an amount is still reusable/non-expiring, unlike a dynamic QR. */
  amount?: string;
  tlv_payload: string;
  crc: string;
  assets: QrAssetMap;
  regenerated?: boolean;
  /** True when a previously printed sticker for this QR now encodes a stale
   * amount and needs reprinting — see acknowledgeReprint to clear it. */
  reprint_required: boolean;
}

export interface DynamicQrResult {
  success: true;
  qr_id: string;
  qr_type: 'dynamic';
  poi_method: '12';
  status: string;
  version: number;
  merchant_id: string;
  alias: string;
  amount: string;
  bill_number?: string;
  reference_label?: string;
  expires_at: string;
  tlv_payload: string;
  crc: string;
  assets: QrAssetMap;
}

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: QrRepository,
    private readonly validators: QrValidators,
    private readonly renderer: QrRendererService,
    private readonly storage: QrStorageService,
    private readonly annex2: QrAnnex2DisplayService,
    private readonly payloadValidator: QrPayloadValidatorService,
    private readonly audit: AuditLogService,
    private readonly scope: MerchantScopeService,
  ) {}

  async generateStatic(
    merchantId: string,
    actor: ActorContext,
    options: {
      storeId?: string;
      terminalId?: string;
      purpose?: string;
      forceRegenerate?: boolean;
      terminalLabel?: string;
      referenceLabel?: string;
      internalRoutingId?: string;
      studentId?: string;
      /** Fixed amount (tag 54) baked into the static payload, e.g. a school's
       * termly fee. The QR stays static/non-expiring — this is distinct from
       * a dynamic QR's amount, which always comes with an expiry. */
      amount?: string | number;
    } = {},
  ): Promise<StaticQrResult> {
    this.scope.requirePermission(actor, Permission.QR_GENERATE);
    const ctx = await this.validators.validateMerchantForQr(merchantId);
    this.scope.assertCanAccessMerchant(actor, {
      id: ctx.merchant.id,
      acquirerId: ctx.merchant.acquirerId,
    });

    await this.assertStore(merchantId, options.storeId);

    // Tag 62/03 Store Label is always the 8-digit Lipa Namba alias per the
    // TANQR spec — it is not a caller-chosen or store-specific value. A
    // specific terminal/POS point (if any) is identified via tag 62/07
    // Terminal Label instead.
    let terminalLabel = options.terminalLabel;
    if (options.storeId) {
      const store = await this.prisma.merchantStore.findFirst({
        where: { id: options.storeId, merchantId },
      });
      if (store) {
        terminalLabel = terminalLabel ?? store.terminalId ?? undefined;
      }
    }
    const existing = await this.repository.findActiveStaticQr(
      merchantId,
      options.storeId,
      options.terminalId,
    );

    const amount =
      options.amount !== undefined
        ? this.validators.validateAmount(options.amount)
        : undefined;
    const existingAmount = existing?.payloadVersions[0]?.amount;
    // A request for a different fixed amount than what's currently baked in
    // must not be silently swallowed by the "return the existing static QR"
    // fast path — it needs a new version, same as an explicit regenerate.
    const amountChanged =
      Boolean(existing) &&
      Number(amount ?? 0) !== Number(existingAmount ?? 0);

    if (existing && !options.forceRegenerate && !amountChanged) {
      return this.toStaticResponse(existing, ctx.alias, false);
    }

    const mcc = this.validators.validateMcc(ctx.merchant.mcc);
    const merchantName = this.validators.sanitizeMerchantName(ctx.merchant.tradingName);
    const city = this.validators.sanitizeCity(ctx.profile.city);
    const postalCode = this.validators.validatePostalCode(ctx.profile.postalCode);

    const referenceLabel =
      options.referenceLabel ?? options.internalRoutingId ?? undefined;

    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: ctx.acquirerId5,
      merchantId: ctx.merchantId15,
      mcc,
      merchantName,
      city,
      postalCode,
      amount,
      additionalData: {
        storeLabel: ctx.alias,
        terminalLabel,
        referenceLabel,
      },
    });

    const isRegenerate = Boolean(existing) && (options.forceRegenerate || amountChanged);
    const version = isRegenerate ? existing!.currentVersion + 1 : 1;

    const qrRecord = await this.repository.persistQrGeneration({
      merchantId,
      studentId: options.studentId,
      storeId: options.storeId,
      terminalId: options.terminalId,
      qrType: QrType.STATIC,
      poiMethod: '11',
      createdBy: actor.sub,
      existingQrId: isRegenerate ? existing!.id : undefined,
      version,
      tlvPayload,
      crcValue,
      tag26MerchantId: ctx.merchantId15,
      tag62StoreLabel: ctx.alias,
      tag62InternalId: referenceLabel,
      tag62TerminalLabel: terminalLabel,
      amount,
      purpose: options.purpose,
      reprintRequired: amountChanged,
    });

    const assets = await this.renderAndStore(
      tlvPayload,
      merchantId,
      qrRecord.id,
      version,
      qrRecord.payloadVersionId,
    );

    await this.audit.record({
      actorId: actor.sub,
      action: isRegenerate ? 'QR_REGENERATED' : 'QR_STATIC_CREATED',
      entityType: 'qr_code',
      entityId: qrRecord.id,
      metadata: {
        merchantId,
        version,
        storeId: options.storeId ?? null,
        terminalId: options.terminalId ?? null,
        purpose: options.purpose ?? null,
        amount: amount ?? null,
      },
    });

    if (amountChanged) {
      // A previously printed physical sticker for this merchant/store/
      // terminal now bakes in a stale amount — nothing in this system (or
      // the external TIPS switch) rejects that old sticker, it would just
      // silently authorize payment at the wrong amount. Surface it as its
      // own audit event so it's easy to alert/report on separately from a
      // routine regeneration, in addition to the reprintRequired flag.
      await this.audit.record({
        actorId: actor.sub,
        action: 'QR_REPRINT_REQUIRED',
        entityType: 'qr_code',
        entityId: qrRecord.id,
        metadata: {
          merchantId,
          version,
          previousAmount: existingAmount != null ? existingAmount.toString() : null,
          newAmount: amount ?? null,
        },
      });
    }

    return {
      success: true,
      qr_id: qrRecord.id,
      qr_type: 'static',
      poi_method: '11',
      status: qrRecord.status.toLowerCase(),
      version,
      merchant_id: merchantId,
      alias: ctx.alias,
      amount,
      tlv_payload: tlvPayload,
      crc: crcValue,
      assets,
      regenerated: isRegenerate,
      reprint_required: amountChanged || Boolean(existing?.reprintRequired),
    };
  }

  async generateDynamic(
    merchantId: string,
    actor: ActorContext,
    options: {
      amount: string | number;
      billNumber?: string;
      referenceLabel?: string;
      storeId?: string;
      terminalId?: string;
      expiresInMinutes?: number;
      terminalLabel?: string;
      internalRoutingId?: string;
    },
  ): Promise<DynamicQrResult> {
    this.scope.requirePermission(actor, Permission.QR_GENERATE);
    const ctx = await this.validators.validateMerchantForQr(merchantId);
    this.scope.assertCanAccessMerchant(actor, {
      id: ctx.merchant.id,
      acquirerId: ctx.merchant.acquirerId,
    });

    await this.assertStore(merchantId, options.storeId);

    const amount = this.validators.validateAmount(options.amount);
    const mcc = this.validators.validateMcc(ctx.merchant.mcc);
    const merchantName = this.validators.sanitizeMerchantName(ctx.merchant.tradingName);
    const city = this.validators.sanitizeCity(ctx.profile.city);
    const postalCode = this.validators.validatePostalCode(ctx.profile.postalCode);

    const referenceLabel =
      options.referenceLabel ?? options.internalRoutingId ?? undefined;

    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '12',
      acquirerId5: ctx.acquirerId5,
      merchantId: ctx.merchantId15,
      mcc,
      merchantName,
      city,
      postalCode,
      amount,
      additionalData: {
        billNumber: options.billNumber,
        storeLabel: ctx.alias,
        terminalLabel: options.terminalLabel,
        referenceLabel,
      },
    });

    const expiresIn = options.expiresInMinutes ?? 30;
    if (expiresIn <= 0) {
      throw new BadRequestException('expires_in_minutes must be positive');
    }
    const expiresAt = new Date(Date.now() + expiresIn * 60_000);

    const qrRecord = await this.repository.persistQrGeneration({
      merchantId,
      storeId: options.storeId,
      terminalId: options.terminalId,
      qrType: QrType.DYNAMIC,
      poiMethod: '12',
      createdBy: actor.sub,
      version: 1,
      tlvPayload,
      crcValue,
      tag26MerchantId: ctx.merchantId15,
      tag62StoreLabel: ctx.alias,
      tag62InternalId: referenceLabel,
      tag62TerminalLabel: options.terminalLabel,
      amount,
      billNumber: options.billNumber,
      referenceLabel,
      expiresAt,
    });

    const assets = await this.renderAndStore(
      tlvPayload,
      merchantId,
      qrRecord.id,
      1,
      qrRecord.payloadVersionId,
    );

    await this.audit.record({
      actorId: actor.sub,
      action: 'QR_DYNAMIC_CREATED',
      entityType: 'qr_code',
      entityId: qrRecord.id,
      metadata: {
        merchantId,
        amount,
        billNumber: options.billNumber ?? null,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      success: true,
      qr_id: qrRecord.id,
      qr_type: 'dynamic',
      poi_method: '12',
      status: qrRecord.status.toLowerCase(),
      version: 1,
      merchant_id: merchantId,
      alias: ctx.alias,
      amount,
      bill_number: options.billNumber,
      reference_label: referenceLabel,
      expires_at: expiresAt.toISOString(),
      tlv_payload: tlvPayload,
      crc: crcValue,
      assets,
    };
  }

  private async renderAndStore(
    tlvPayload: string,
    merchantId: string,
    qrId: string,
    version: number,
    payloadVersionId: string,
  ): Promise<QrAssetMap> {
    const rendered = await this.renderer.renderAll(tlvPayload);
    const stored = await this.storage.saveRenderedAssets(
      merchantId,
      qrId,
      version,
      rendered,
    );
    await this.repository.saveRenderAssets(qrId, payloadVersionId, stored, this.storage.getBucket());
    const map: QrAssetMap = {};
    for (const asset of stored) {
      map[asset.format] = asset.publicUrl;
    }
    return map;
  }

  private async assertStore(merchantId: string, storeId?: string): Promise<void> {
    if (!storeId) return;
    const store = await this.prisma.merchantStore.findFirst({
      where: { id: storeId, merchantId },
    });
    if (!store) {
      throw new NotFoundException('Store not found for merchant');
    }
  }

  private async toStaticResponse(
    existing: Awaited<ReturnType<QrRepository['findActiveStaticQr']>> & object,
    alias: string,
    regenerated: boolean,
  ): Promise<StaticQrResult> {
    const latest = existing.payloadVersions[0];
    const assets = await this.repository.getAssetUrls(existing.id, latest.version);
    return {
      success: true,
      qr_id: existing.id,
      qr_type: 'static',
      poi_method: '11',
      status: existing.status.toLowerCase(),
      version: latest.version,
      merchant_id: existing.merchantId,
      alias,
      amount: latest.amount != null ? latest.amount.toString() : undefined,
      tlv_payload: latest.tlvPayload,
      crc: latest.crcValue,
      assets,
      regenerated,
      reprint_required: existing.reprintRequired,
    };
  }

  async listMerchantQrs(merchantId: string, actor: ActorContext) {
    this.scope.requirePermission(actor, Permission.QR_READ);
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        profile: true,
        merchantAlias: true,
        kyc: true,
        settlementConfig: true,
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
    this.scope.assertCanAccessMerchant(actor, {
      id: merchant.id,
      acquirerId: merchant.acquirerId,
    });

    const tipsRegistration = await this.prisma.tipsRegistration
      .findUnique({ where: { merchantId } })
      .catch(() => null);

    const alias = merchant.merchantAlias?.alias8digit ?? null;
    const tipsRegistered =
      tipsRegistration?.status === 'REGISTERED' ||
      merchant.integrations[0]?.status === 'SUCCESS' ||
      Boolean(merchant.acquirer.tipsAcquirerId5);

    const rows = await this.repository.listAllForMerchant(merchantId);
    const qrCodes = await Promise.all(
      rows.map(async (row) => {
        const latest = row.payloadVersions[0];
        const assets = latest
          ? await this.repository.getAssetUrls(row.id, latest.version)
          : {};
        const status = this.mapQrStatus(row.status, row.expiresAt);
        return {
          id: row.id,
          merchant_id: merchantId,
          student_id: row.studentId,
          student_name: row.student?.fullName ?? null,
          admission_no: row.student?.admissionNo ?? null,
          qr_type: row.qrType.toLowerCase() as 'static' | 'dynamic',
          poi_method: row.poiMethod as '11' | '12',
          status,
          alias: latest?.tag62StoreLabel ?? alias ?? '',
          merchant_name: merchant.tradingName,
          mcc: merchant.mcc,
          city: merchant.profile?.city ?? null,
          amount: latest?.amount?.toString() ?? null,
          bill_number: latest?.billNumber ?? null,
          reference_label: latest?.referenceLabel ?? latest?.tag62InternalId ?? null,
          version: latest?.version ?? row.currentVersion,
          crc: latest?.crcValue ?? '',
          tlv_payload: latest?.tlvPayload ?? '',
          created_at: row.createdAt.toISOString(),
          expires_at: row.expiresAt?.toISOString() ?? null,
          reprint_required: row.reprintRequired,
          assets,
        };
      }),
    );

    const summary = {
      total: qrCodes.length,
      active: qrCodes.filter((q) => q.status === 'active').length,
      static: qrCodes.filter((q) => q.qr_type === 'static').length,
      dynamic: qrCodes.filter((q) => q.qr_type === 'dynamic').length,
      expired: qrCodes.filter((q) => q.status === 'expired').length,
    };

    return {
      merchant_id: merchantId,
      merchant: {
        id: merchant.id,
        trading_name: merchant.tradingName,
        status: merchant.status,
        mcc: merchant.mcc,
        is_school: merchant.isSchool,
        city: merchant.profile?.city ?? null,
      },
      eligibility: {
        kyc_approved: merchant.kyc?.status === 'APPROVED',
        merchant_active: merchant.status === 'ACTIVE',
        alias_available: Boolean(merchant.merchantAlias?.isActive && alias),
        tips_registered: tipsRegistered,
        settlement_configured:
          merchant.settlementConfig?.approvalStatus === 'APPROVED',
      },
      summary,
      qr_codes: qrCodes,
    };
  }

  async validatePayload(dto: Parameters<QrPayloadValidatorService['validateRequest']>[0]) {
    return this.payloadValidator.validateRequest(dto);
  }

  async getQrImageBuffer(
    qrId: string,
    actor: ActorContext,
    format: 'png' | 'svg' = 'png',
  ): Promise<{ buffer: Buffer; contentType: string }> {
    this.scope.requirePermission(actor, Permission.QR_READ);
    const qr = await this.prisma.qrCode.findUniqueOrThrow({
      where: { id: qrId },
      include: {
        merchant: { include: { acquirer: true } },
        payloadVersions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    this.scope.assertCanAccessMerchant(actor, {
      id: qr.merchantId,
      acquirerId: qr.merchant.acquirerId,
    });

    const latest = qr.payloadVersions[0];
    if (!latest) {
      throw new NotFoundException('QR payload not found');
    }

    let asset = await this.repository.getRenderAsset(qrId, latest.version, format);
    if (!asset) {
      const rendered =
        format === 'png'
          ? await this.renderer.renderPng(latest.tlvPayload)
          : await this.renderer.renderSvg(latest.tlvPayload);
      const stored = await this.storage.saveRenderedAssets(
        qr.merchantId,
        qrId,
        latest.version,
        [rendered],
      );
      await this.repository.saveRenderAssets(
        qrId,
        latest.id,
        stored,
        this.storage.getBucket(),
      );
      asset = await this.repository.getRenderAsset(qrId, latest.version, format);
    }

    if (!asset) {
      throw new NotFoundException(`QR ${format} asset not found`);
    }

    const buffer = await this.storage.readAsset(asset.s3Key);
    return {
      buffer,
      contentType: format === 'png' ? 'image/png' : 'image/svg+xml',
    };
  }

  async getDisplayPdf(
    qrId: string,
    actor: ActorContext,
    paperSize?: string,
  ): Promise<Buffer> {
    this.scope.requirePermission(actor, Permission.QR_READ);
    const qr = await this.prisma.qrCode.findUniqueOrThrow({
      where: { id: qrId },
      include: {
        merchant: { include: { acquirer: true } },
        payloadVersions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    this.scope.assertCanAccessMerchant(actor, {
      id: qr.merchantId,
      acquirerId: qr.merchant.acquirerId,
    });

    const latest = qr.payloadVersions[0];
    if (!latest) {
      throw new NotFoundException('QR payload not found');
    }

    const { buffer: qrPng } = await this.getQrImageBuffer(qrId, actor, 'png');
    const alias =
      extractTag62SubTag(latest.tlvPayload, '03') ??
      latest.tag62StoreLabel ??
      '--------';

    return this.annex2.renderPdf({
      merchantName: qr.merchant.tradingName,
      aliasMerchantId: alias,
      qrImagePng: qrPng,
      acquirerName: qr.merchant.acquirer.tradingName ?? qr.merchant.acquirer.legalName,
      acquirerSlogan: 'Scan to Pay with TANQR',
      paperSize,
    });
  }

  async disableQr(qrId: string, actor: ActorContext) {
    this.scope.requirePermission(actor, Permission.QR_GENERATE);
    const qr = await this.prisma.qrCode.findUniqueOrThrow({
      where: { id: qrId },
      include: { merchant: true },
    });
    this.scope.assertCanAccessMerchant(actor, {
      id: qr.merchantId,
      acquirerId: qr.merchant.acquirerId,
    });
    await this.repository.disableQr(qrId);
    await this.audit.record({
      actorId: actor.sub,
      action: 'QR_DISABLED',
      entityType: 'qr_code',
      entityId: qrId,
      metadata: { merchantId: qr.merchantId },
    });
    return { success: true, qr_id: qrId, status: 'disabled' };
  }

  /**
   * Clears the reprintRequired flag once ops/branch staff confirm the new
   * sticker (reflecting the current fixed amount) has physically replaced
   * the stale one in the field.
   */
  async acknowledgeReprint(qrId: string, actor: ActorContext) {
    this.scope.requirePermission(actor, Permission.QR_GENERATE);
    const qr = await this.prisma.qrCode.findUniqueOrThrow({
      where: { id: qrId },
      include: { merchant: true },
    });
    this.scope.assertCanAccessMerchant(actor, {
      id: qr.merchantId,
      acquirerId: qr.merchant.acquirerId,
    });
    await this.repository.clearReprintFlag(qrId);
    await this.audit.record({
      actorId: actor.sub,
      action: 'QR_REPRINT_ACKNOWLEDGED',
      entityType: 'qr_code',
      entityId: qrId,
      metadata: { merchantId: qr.merchantId },
    });
    return { success: true, qr_id: qrId, reprint_required: false };
  }

  async regenerateQr(qrId: string, actor: ActorContext) {
    this.scope.requirePermission(actor, Permission.QR_GENERATE);
    const qr = await this.prisma.qrCode.findUniqueOrThrow({
      where: { id: qrId },
      include: {
        merchant: true,
        payloadVersions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (qr.qrType !== QrType.STATIC) {
      throw new BadRequestException('Only static QR codes can be regenerated');
    }
    this.scope.assertCanAccessMerchant(actor, {
      id: qr.merchantId,
      acquirerId: qr.merchant.acquirerId,
    });

    // This endpoint only rebuilds the payload from current merchant data
    // (e.g. a trading-name or postal-code correction) — it exposes no way to
    // change amount/reference/terminal label, so whatever was already baked
    // in must be carried forward. Without this, regenerating silently
    // stripped a static QR's fixed amount (and reference/terminal labels).
    const latest = qr.payloadVersions[0];
    return this.generateStatic(qr.merchantId, actor, {
      storeId: qr.storeId ?? undefined,
      terminalId: qr.terminalId ?? undefined,
      forceRegenerate: true,
      amount: latest?.amount != null ? latest.amount.toString() : undefined,
      internalRoutingId: latest?.tag62InternalId ?? undefined,
      terminalLabel: latest?.tag62TerminalLabel ?? undefined,
    });
  }

  private mapQrStatus(
    status: QrStatus,
    expiresAt: Date | null,
  ): 'active' | 'pending' | 'expired' | 'disabled' | 'paid' {
    if (status === QrStatus.REVOKED) return 'disabled';
    if (status === QrStatus.EXPIRED) return 'expired';
    if (expiresAt && expiresAt.getTime() < Date.now()) return 'expired';
    if (status === QrStatus.ACTIVE) return 'active';
    return 'pending';
  }
}
