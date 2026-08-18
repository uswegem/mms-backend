import { IntegrationStatus, IntegrationType } from '@prisma/client';
import { MockTpsRegistrationProvider } from './mock-tps-registration.provider';

function buildRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    merchantId: 'merchant-1',
    legalName: 'YN Restaurants Limited',
    tradingName: 'YN RESTAURANTS',
    mcc: '5814',
    taxId: '123456781',
    ...overrides,
  };
}

function buildProvider(
  overrides: {
    existing?: {
      externalReferenceId: string;
      responsePayload: Record<string, unknown>;
    };
  } = {},
) {
  const prisma = {
    merchantIntegration: {
      findFirst: jest
        .fn()
        .mockResolvedValue('existing' in overrides ? overrides.existing : null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const provider = new MockTpsRegistrationProvider(prisma as never);
  return { provider, prisma };
}

describe('MockTpsRegistrationProvider', () => {
  it('registers successfully and persists a SUCCESS MerchantIntegration row', async () => {
    const { provider, prisma } = buildProvider();

    const result = await provider.registerMerchant(
      buildRequest(),
      'idem-key-1',
      'actor-1',
    );

    expect(result.success).toBe(true);
    expect(result.tpsMerchantId).toMatch(/^TIPS-/);
    const call = (
      prisma.merchantIntegration.upsert.mock.calls as unknown[][]
    )[0][0] as {
      create: {
        merchantId: string;
        integrationType: string;
        idempotencyKey: string;
        status: string;
      };
    };
    expect(call.create).toMatchObject({
      merchantId: 'merchant-1',
      integrationType: IntegrationType.TPS,
      idempotencyKey: 'idem-key-1',
      status: IntegrationStatus.SUCCESS,
    });
  });

  it('replays the cached result for a retried request sharing the same idempotency key, without a second upsert', async () => {
    const { provider, prisma } = buildProvider({
      existing: {
        externalReferenceId: 'TIPS-CACHED-1',
        responsePayload: {
          code: 'TIPS_REGISTERED',
          tipsMerchantId: 'TIPS-CACHED-1',
        },
      },
    });

    const result = await provider.registerMerchant(
      buildRequest(),
      'idem-key-1',
      'actor-1',
    );

    expect(result).toEqual({
      success: true,
      tpsMerchantId: 'TIPS-CACHED-1',
      referenceId: 'TIPS-CACHED-1',
      responsePayload: {
        code: 'TIPS_REGISTERED',
        tipsMerchantId: 'TIPS-CACHED-1',
      },
    });
    expect(prisma.merchantIntegration.upsert).not.toHaveBeenCalled();
  });

  it('simulates a rejection via the explicit simulateOutcome field, not a hidden string match on business data', async () => {
    const { provider, prisma } = buildProvider();

    const result = await provider.registerMerchant(
      buildRequest({ simulateOutcome: 'FAIL' }),
      'idem-key-2',
      'actor-1',
    );

    expect(result.success).toBe(false);
    expect(result.failureReason).toBeDefined();
    expect(result.tpsMerchantId).toBeUndefined();
    const call = (
      prisma.merchantIntegration.upsert.mock.calls as unknown[][]
    )[0][0] as { create: { status: string } };
    expect(call.create.status).toBe(IntegrationStatus.FAILED);
  });

  it('does not simulate failure just because the trading/legal name happens to contain "TIPS_FAIL" (the old, removed hidden-trigger behavior)', async () => {
    const { provider } = buildProvider();

    const result = await provider.registerMerchant(
      buildRequest({ tradingName: 'TIPS_FAIL LOGISTICS LTD' }),
      'idem-key-3',
      'actor-1',
    );

    expect(result.success).toBe(true);
  });
});
