import { QrType } from '@prisma/client';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { QrService } from '../application/services/qr.service';
import { QrPayloadValidatorService } from '../application/services/qr-payload-validator.service';
import { buildTLV } from '../domain/tlv.builder';
import { buildTanqrPayload, verifyTanqrCrc } from '../domain/tanqr-payload.builder';

describe('QrService', () => {
  const actor = {
    sub: 'user-1',
    email: 'a@mms.local',
    acquirerId: 'acq-1',
    merchantId: 'merchant-1',
    roles: ['MERCHANT_ADMIN'],
    permissions: [Permission.QR_GENERATE, Permission.QR_READ],
  };

  const merchantCtx = {
    merchant: {
      id: 'merchant-1',
      acquirerId: 'acq-1',
      status: 'ACTIVE',
      mcc: '8211',
      tradingName: 'MAPAMBANO SECONDARY',
      deletedAt: null,
      isSchool: true,
    },
    profile: { city: 'DAR ES SALAAM', postalCode: '11000' },
    alias: '78000028',
    merchantId15: '044000000000001',
    acquirerId5: '01044',
    tipsRegistered: true,
  };

  function buildService(
    overrides: Partial<Record<string, unknown>> = {},
    prismaOverrides: Partial<Record<string, unknown>> = {},
    redis: unknown = null,
  ) {
    const repository = {
      findActiveStaticQr: jest.fn().mockResolvedValue(null),
      persistQrGeneration: jest.fn().mockResolvedValue({
        id: 'qr-1',
        status: 'ACTIVE',
        payloadVersionId: 'pv-1',
      }),
      saveRenderAssets: jest.fn(),
      getAssetUrls: jest.fn(),
      clearReprintFlag: jest.fn(),
      allocateDynamicBillNumber: jest.fn().mockResolvedValue('DYN000001'),
      supersedeActiveDynamicQrs: jest.fn(),
      findDynamicQrVersionByBillNumber: jest.fn().mockResolvedValue(null),
      ...overrides,
    };
    const validators = {
      validateMerchantForQr: jest.fn().mockResolvedValue(merchantCtx),
      validateMcc: jest.fn((mcc: string) => mcc),
      sanitizeMerchantName: jest.fn((n: string) => n.slice(0, 25)),
      sanitizeCity: jest.fn((c: string) => c.slice(0, 15)),
      validatePostalCode: jest.fn((p: string) => p),
      validateAmount: jest.fn((a: string) => a),
    };
    const renderer = {
      renderAll: jest.fn().mockResolvedValue([
        { format: 'png', buffer: Buffer.from('png'), width: 300, height: 300, fileHash: 'a' },
        { format: 'svg', buffer: Buffer.from('svg'), width: 300, height: 300, fileHash: 'b' },
      ]),
    };
    const storage = {
      saveRenderedAssets: jest.fn().mockResolvedValue([
        { format: 'png', publicUrl: '/storage/qr/m/qr-1/v1.png' },
        { format: 'svg', publicUrl: '/storage/qr/m/qr-1/v1.svg' },
      ]),
      getBucket: jest.fn().mockReturnValue('local'),
    };
    const audit = { record: jest.fn() };
    const annex2 = { renderPdf: jest.fn(), renderSvg: jest.fn() };
    // Real instance — QrPayloadValidatorService has no DB dependencies, and
    // validatePayload's own logic depends on its actual self-check output
    // (mode/valid/poiMethod), not just that some function was called.
    const payloadValidator = new QrPayloadValidatorService();
    const scope = {
      requirePermission: jest.fn(),
      assertCanAccessMerchant: jest.fn(),
    };
    const prisma = {
      merchantStore: { findFirst: jest.fn() },
      ...prismaOverrides,
    };

    const service = new QrService(
      prisma as never,
      repository as never,
      validators as never,
      renderer as never,
      storage as never,
      annex2 as never,
      payloadValidator as never,
      audit as never,
      scope as never,
      redis as never,
    );

    return { service, repository, validators, audit, scope, storage, renderer, prisma };
  }

  it('generates static QR with golden school fields', async () => {
    const { service, repository, audit } = buildService();
    const result = await service.generateStatic('merchant-1', actor, {
      internalRoutingId: '00100014',
    });

    expect(result.success).toBe(true);
    expect(result.qr_type).toBe('static');
    expect(verifyTanqrCrc(result.tlv_payload, result.crc)).toBe(true);
    // Tag 26/02 carries the bank Merchant ID, tag 62/03 carries the distinct
    // 8-digit Lipa Namba alias — the two must not be conflated.
    expect(result.tlv_payload).toContain(buildTLV('02', merchantCtx.merchantId15));
    expect(result.tlv_payload).toContain(buildTLV('03', merchantCtx.alias));
    expect(result.tlv_payload).toContain('78000028');
    expect(repository.persistQrGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        qrType: QrType.STATIC,
        poiMethod: '11',
        tag26MerchantId: merchantCtx.merchantId15,
        tag62StoreLabel: merchantCtx.alias,
        tag62InternalId: '00100014',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QR_STATIC_CREATED' }),
    );
  });

  it('reuses existing static QR when force_regenerate is false', async () => {
    const existing = {
      id: 'qr-existing',
      merchantId: 'merchant-1',
      status: 'ACTIVE',
      reprintRequired: false,
      payloadVersions: [
        {
          version: 1,
          tlvPayload: 'payload',
          crcValue: '35EA',
        },
      ],
    };
    const { service, repository } = buildService({
      findActiveStaticQr: jest.fn().mockResolvedValue(existing),
      getAssetUrls: jest.fn().mockResolvedValue({ png: '/storage/x.png' }),
    });

    const result = await service.generateStatic('merchant-1', actor, {});
    expect(result.qr_id).toBe('qr-existing');
    expect(repository.persistQrGeneration).not.toHaveBeenCalled();
    expect(result.reprint_required).toBe(false);
  });

  it('generates a static QR with a fixed amount (tag 54) and no expiry — e.g. a school termly fee', async () => {
    const { service, repository, audit } = buildService();
    const result = await service.generateStatic('merchant-1', actor, {
      amount: '150000',
    });

    expect(result.success).toBe(true);
    expect(result.qr_type).toBe('static');
    expect(result.amount).toBe('150000');
    expect(verifyTanqrCrc(result.tlv_payload, result.crc)).toBe(true);
    expect(result.tlv_payload).toContain(buildTLV('54', '150000'));

    expect(repository.persistQrGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        qrType: QrType.STATIC,
        poiMethod: '11',
        amount: '150000',
      }),
    );
    const persistedArgs = repository.persistQrGeneration.mock.calls[0][0];
    expect(persistedArgs.expiresAt).toBeUndefined();

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'QR_STATIC_CREATED',
        metadata: expect.objectContaining({ amount: '150000' }),
      }),
    );
  });

  it('creates a new version and flags reprint_required when the requested fixed amount differs from the existing static QR', async () => {
    const existing = {
      id: 'qr-existing',
      merchantId: 'merchant-1',
      status: 'ACTIVE',
      currentVersion: 1,
      reprintRequired: false,
      payloadVersions: [
        {
          version: 1,
          tlvPayload: 'old-payload',
          crcValue: '35EA',
          amount: '100000',
        },
      ],
    };
    const { service, repository, audit } = buildService({
      findActiveStaticQr: jest.fn().mockResolvedValue(existing),
    });

    const result = await service.generateStatic('merchant-1', actor, {
      amount: '150000',
    });

    expect(repository.persistQrGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        existingQrId: 'qr-existing',
        version: 2,
        amount: '150000',
        reprintRequired: true,
      }),
    );
    expect(result.regenerated).toBe(true);
    expect(result.amount).toBe('150000');
    expect(result.reprint_required).toBe(true);
    // A dedicated alert event, distinct from the routine QR_REGENERATED
    // audit entry — a previously printed sticker is now stale.
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'QR_REPRINT_REQUIRED',
        metadata: expect.objectContaining({
          previousAmount: '100000',
          newAmount: '150000',
        }),
      }),
    );
  });

  it('does not flag reprint_required for a plain regeneration with no amount change (e.g. a trading-name fix)', async () => {
    const existing = {
      id: 'qr-existing',
      merchantId: 'merchant-1',
      status: 'ACTIVE',
      currentVersion: 1,
      reprintRequired: false,
      payloadVersions: [
        {
          version: 1,
          tlvPayload: 'old-payload',
          crcValue: '35EA',
        },
      ],
    };
    const { service, repository, audit } = buildService({
      findActiveStaticQr: jest.fn().mockResolvedValue(existing),
    });

    const result = await service.generateStatic('merchant-1', actor, {
      forceRegenerate: true,
    });

    expect(repository.persistQrGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ existingQrId: 'qr-existing', version: 2 }),
    );
    const persistedArgs = repository.persistQrGeneration.mock.calls[0][0];
    expect(persistedArgs.reprintRequired).toBe(false);
    expect(result.reprint_required).toBe(false);
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QR_REPRINT_REQUIRED' }),
    );
  });

  it('acknowledgeReprint clears the flag and records an audit event', async () => {
    const { service, repository, audit, prisma } = buildService(
      {},
      {
        qrCode: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'qr-existing',
            merchantId: 'merchant-1',
            merchant: { id: 'merchant-1', acquirerId: 'acq-1' },
          }),
        },
      },
    );

    const result = await service.acknowledgeReprint('qr-existing', actor);

    expect(repository.clearReprintFlag).toHaveBeenCalledWith('qr-existing');
    expect(result).toEqual({
      success: true,
      qr_id: 'qr-existing',
      reprint_required: false,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QR_REPRINT_ACKNOWLEDGED' }),
    );
    expect((prisma as any).qrCode.findUniqueOrThrow).toHaveBeenCalled();
  });

  it('regenerateQr preserves the existing fixed amount, reference label, and terminal label instead of stripping them', async () => {
    const oldBuilt = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: merchantCtx.acquirerId5,
      merchantId: merchantCtx.merchantId15,
      mcc: '8211',
      merchantName: 'MAPAMBANO SECONDARY',
      city: 'DAR ES SALAAM',
      postalCode: '11000',
      amount: '150000',
      additionalData: {
        storeLabel: merchantCtx.alias,
        terminalLabel: 'POS-07',
        referenceLabel: '00100014',
      },
    });
    const latestVersion = {
      version: 1,
      tlvPayload: oldBuilt.tlvPayload,
      crcValue: oldBuilt.crcValue,
      amount: '150000',
      tag62InternalId: '00100014',
      tag62TerminalLabel: 'POS-07',
    };
    const existing = {
      id: 'qr-existing',
      merchantId: 'merchant-1',
      status: 'ACTIVE',
      currentVersion: 1,
      reprintRequired: false,
      payloadVersions: [latestVersion],
    };

    const { service, repository, audit } = buildService(
      { findActiveStaticQr: jest.fn().mockResolvedValue(existing) },
      {
        qrCode: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'qr-existing',
            merchantId: 'merchant-1',
            qrType: QrType.STATIC,
            storeId: null,
            terminalId: null,
            merchant: { id: 'merchant-1', acquirerId: 'acq-1' },
            payloadVersions: [latestVersion],
          }),
        },
      },
    );

    const result = await service.regenerateQr('qr-existing', actor);

    expect(repository.persistQrGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '150000',
        tag62InternalId: '00100014',
        tag62TerminalLabel: 'POS-07',
        reprintRequired: false,
      }),
    );
    expect(result.tlv_payload).toContain(buildTLV('54', '150000'));
    expect(result.tlv_payload).toContain(buildTLV('07', 'POS-07'));
    expect(result.reprint_required).toBe(false);
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QR_REPRINT_REQUIRED' }),
    );
  });

  it('reuses the existing static QR when the same fixed amount is requested again', async () => {
    const existing = {
      id: 'qr-existing',
      merchantId: 'merchant-1',
      status: 'ACTIVE',
      currentVersion: 1,
      reprintRequired: false,
      payloadVersions: [
        {
          version: 1,
          tlvPayload: 'payload',
          crcValue: '35EA',
          // Simulates a Postgres NUMERIC(18,2) round-trip: '150000' stored,
          // '150000.00' read back — must still compare equal to a fresh
          // request for '150000'.
          amount: '150000.00',
        },
      ],
    };
    const { service, repository } = buildService({
      findActiveStaticQr: jest.fn().mockResolvedValue(existing),
      getAssetUrls: jest.fn().mockResolvedValue({ png: '/storage/x.png' }),
    });

    const result = await service.generateStatic('merchant-1', actor, {
      amount: '150000',
    });

    expect(repository.persistQrGeneration).not.toHaveBeenCalled();
    expect(result.qr_id).toBe('qr-existing');
    expect(result.amount).toBe('150000.00');
  });

  it('generates dynamic invoice QR with amount and bill number', async () => {
    const { service, repository, audit } = buildService();
    const result = await service.generateDynamic('merchant-1', actor, {
      amount: '150000',
      billNumber: 'TERM1-2024-00100014',
      referenceLabel: '00100014',
      expiresInMinutes: 30,
    });

    expect(result.success).toBe(true);
    expect(result.qr_type).toBe('dynamic');
    expect(result.amount).toBe('150000');
    expect(verifyTanqrCrc(result.tlv_payload, result.crc)).toBe(true);
    expect(result.tlv_payload).toContain(buildTLV('02', merchantCtx.merchantId15));
    expect(result.tlv_payload).toContain(buildTLV('03', merchantCtx.alias));
    expect(repository.persistQrGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        qrType: QrType.DYNAMIC,
        poiMethod: '12',
        amount: '150000',
        billNumber: 'TERM1-2024-00100014',
        tag26MerchantId: merchantCtx.merchantId15,
        tag62StoreLabel: merchantCtx.alias,
      }),
    );
    // Dynamic QRs still always get an expiry — unaffected by static QRs now
    // being able to carry an amount without one.
    expect(result.expires_at).toBeTruthy();
    const persistedArgs = repository.persistQrGeneration.mock.calls[0][0];
    expect(persistedArgs.expiresAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QR_DYNAMIC_CREATED' }),
    );
  });

  describe('validatePayload — dynamic QR replay guard', () => {
    const stalePayload = buildTanqrPayload({
      poiMethod: '12',
      acquirerId5: merchantCtx.acquirerId5,
      merchantId: merchantCtx.merchantId15,
      mcc: '8211',
      merchantName: 'MAPAMBANO SECONDARY',
      city: 'DAR ES SALAAM',
      postalCode: '11000',
      amount: '50000',
      additionalData: { storeLabel: merchantCtx.alias, billNumber: 'DYN000001' },
    });

    it('rejects a scan of an expired-but-structurally-valid dynamic QR whose merchant has since generated a newer active version', async () => {
      // The stale QR's own CRC/format are still perfectly valid — this is
      // exactly the "screenshot from an earlier session" replay scenario.
      const { service, repository } = buildService({
        findDynamicQrVersionByBillNumber: jest.fn().mockResolvedValue({
          tlvPayload: stalePayload.tlvPayload,
          qrCode: {
            // Superseded when the merchant generated a newer dynamic QR,
            // and its own validity window has also since passed.
            status: 'REVOKED',
            expiresAt: new Date(Date.now() - 60_000),
          },
        }),
      });

      const outcome = await service.validatePayload({ tlv_payload: stalePayload.tlvPayload });

      expect(outcome.mode).toBe('verify');
      if (outcome.mode !== 'verify') throw new Error('unreachable');
      expect(outcome.result.valid).toBe(false);
      expect(outcome.result.errors.join(' ')).toMatch(/superseded|disabled/);
      expect(repository.findDynamicQrVersionByBillNumber).toHaveBeenCalledWith(
        merchantCtx.merchantId15,
        'DYN000001',
      );
    });

    it('rejects a scan of an expired dynamic QR even when it was never superseded', async () => {
      const { service } = buildService({
        findDynamicQrVersionByBillNumber: jest.fn().mockResolvedValue({
          tlvPayload: stalePayload.tlvPayload,
          qrCode: { status: 'ACTIVE', expiresAt: new Date(Date.now() - 60_000) },
        }),
      });

      const outcome = await service.validatePayload({ tlv_payload: stalePayload.tlvPayload });

      if (outcome.mode !== 'verify') throw new Error('unreachable');
      expect(outcome.result.valid).toBe(false);
      expect(outcome.result.errors.join(' ')).toMatch(/expired/i);
    });

    it('rejects a scan whose payload does not match the recorded version for that Bill Number', async () => {
      const { service } = buildService({
        findDynamicQrVersionByBillNumber: jest.fn().mockResolvedValue({
          tlvPayload: 'a-different-recorded-payload',
          qrCode: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) },
        }),
      });

      const outcome = await service.validatePayload({ tlv_payload: stalePayload.tlvPayload });

      if (outcome.mode !== 'verify') throw new Error('unreachable');
      expect(outcome.result.valid).toBe(false);
      expect(outcome.result.errors.join(' ')).toMatch(/does not match/i);
    });

    it('accepts a scan of the current, active, unexpired dynamic QR', async () => {
      const { service } = buildService({
        findDynamicQrVersionByBillNumber: jest.fn().mockResolvedValue({
          tlvPayload: stalePayload.tlvPayload,
          qrCode: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) },
        }),
      });

      const outcome = await service.validatePayload({ tlv_payload: stalePayload.tlvPayload });

      if (outcome.mode !== 'verify') throw new Error('unreachable');
      expect(outcome.result.valid).toBe(true);
    });

    it('does not run the replay check for a static QR — static QRs are meant to be reused indefinitely', async () => {
      const staticPayload = buildTanqrPayload({
        poiMethod: '11',
        acquirerId5: merchantCtx.acquirerId5,
        merchantId: merchantCtx.merchantId15,
        mcc: '8211',
        merchantName: 'MAPAMBANO SECONDARY',
        city: 'DAR ES SALAAM',
        postalCode: '11000',
        additionalData: { storeLabel: merchantCtx.alias },
      });
      const { service, repository } = buildService();

      const outcome = await service.validatePayload({ tlv_payload: staticPayload.tlvPayload });

      if (outcome.mode !== 'verify') throw new Error('unreachable');
      expect(outcome.result.valid).toBe(true);
      expect(repository.findDynamicQrVersionByBillNumber).not.toHaveBeenCalled();
    });
  });

  describe('Idempotency-Key de-duplication', () => {
    function createMockRedis() {
      const store = new Map<string, string>();
      return {
        store,
        set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
          if (args.includes('NX') && store.has(key)) return null;
          store.set(key, value);
          return 'OK';
        }),
        get: jest.fn(async (key: string) => store.get(key) ?? null),
        del: jest.fn(async (key: string) => {
          store.delete(key);
          return 1;
        }),
      };
    }

    it('replays the cached result for a retried static QR request with the same key, without generating again', async () => {
      const redis = createMockRedis();
      const { service, repository } = buildService({}, {}, redis);

      const first = await service.generateStatic('merchant-1', actor, {
        idempotencyKey: 'abc-123',
      });
      const second = await service.generateStatic('merchant-1', actor, {
        idempotencyKey: 'abc-123',
      });

      expect(repository.persistQrGeneration).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('replays the cached result for a retried dynamic QR request with the same key, without minting a new QrPayloadVersion', async () => {
      const redis = createMockRedis();
      const { service, repository } = buildService({}, {}, redis);

      const first = await service.generateDynamic('merchant-1', actor, {
        amount: '150000',
        idempotencyKey: 'dyn-key-1',
      });
      const second = await service.generateDynamic('merchant-1', actor, {
        amount: '150000',
        idempotencyKey: 'dyn-key-1',
      });

      expect(repository.persistQrGeneration).toHaveBeenCalledTimes(1);
      expect(repository.supersedeActiveDynamicQrs).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('rejects a concurrent request sharing the same key while the first is still in flight', async () => {
      const redis = createMockRedis();
      redis.store.set('qr:idem:merchant-1:dynamic:concurrent-1', '__PROCESSING__');
      const { service } = buildService({}, {}, redis);

      await expect(
        service.generateDynamic('merchant-1', actor, {
          amount: '1000',
          idempotencyKey: 'concurrent-1',
        }),
      ).rejects.toThrow('already being processed');
    });

    it('releases the lock on failure so a subsequent retry with the same key can succeed', async () => {
      const redis = createMockRedis();
      const persistQrGeneration = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ id: 'qr-1', status: 'ACTIVE', payloadVersionId: 'pv-1' });
      const { service } = buildService({ persistQrGeneration }, {}, redis);

      await expect(
        service.generateStatic('merchant-1', actor, { idempotencyKey: 'retry-after-fail' }),
      ).rejects.toThrow('boom');

      const result = await service.generateStatic('merchant-1', actor, {
        idempotencyKey: 'retry-after-fail',
      });

      expect(result.success).toBe(true);
      expect(persistQrGeneration).toHaveBeenCalledTimes(2);
    });

    it('does not de-duplicate when no Idempotency-Key is supplied', async () => {
      const redis = createMockRedis();
      const { service, repository } = buildService({}, {}, redis);

      await service.generateStatic('merchant-1', actor, {});
      await service.generateStatic('merchant-1', actor, {});

      expect(repository.persistQrGeneration).toHaveBeenCalledTimes(2);
      expect(redis.set).not.toHaveBeenCalled();
    });
  });
});
