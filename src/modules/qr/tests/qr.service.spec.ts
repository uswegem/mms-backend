import { QrType } from '@prisma/client';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { QrService } from '../application/services/qr.service';

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
    acquirerId5: '01044',
    tipsRegistered: true,
  };

  function buildService(overrides: Partial<Record<string, unknown>> = {}) {
    const repository = {
      findActiveStaticQr: jest.fn().mockResolvedValue(null),
      persistQrGeneration: jest.fn().mockResolvedValue({
        id: 'qr-1',
        status: 'ACTIVE',
        payloadVersionId: 'pv-1',
      }),
      saveRenderAssets: jest.fn(),
      getAssetUrls: jest.fn(),
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
    const payloadValidator = { validateRequest: jest.fn() };
    const scope = {
      requirePermission: jest.fn(),
      assertCanAccessMerchant: jest.fn(),
    };
    const prisma = {
      merchantStore: { findFirst: jest.fn() },
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
    );

    return { service, repository, validators, audit, scope, storage, renderer };
  }

  it('generates static QR with golden school fields', async () => {
    const { service, repository, audit } = buildService();
    const result = await service.generateStatic('merchant-1', actor, {
      internalRoutingId: '00100014',
    });

    expect(result.success).toBe(true);
    expect(result.qr_type).toBe('static');
    expect(result.crc).toBe('35EA');
    expect(result.tlv_payload).toContain('78000028');
    expect(repository.persistQrGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        qrType: QrType.STATIC,
        poiMethod: '11',
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
    expect(result.crc).toBe('A362');
    expect(repository.persistQrGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        qrType: QrType.DYNAMIC,
        poiMethod: '12',
        amount: '150000',
        billNumber: 'TERM1-2024-00100014',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QR_DYNAMIC_CREATED' }),
    );
  });
});
