import { CreateMerchantHandler } from './create-merchant.handler';
import { CreateMerchantCommand } from '../commands/create-merchant.command';
import { InvalidLocationException } from '@modules/reference-data/domain/exceptions/reference-data.exceptions';

function buildMerchant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'merchant-1',
    acquirerId: 'acquirer-1',
    legalName: 'YN Restaurants Limited',
    tradingName: 'YN RESTAURANTS',
    status: 'PENDING',
    mcc: '5814',
    taxId: null,
    isSchool: false,
    onboardedAt: null,
    profile: null,
    kyc: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    pendingStatusAction: null,
    pendingStatusReason: null,
    pendingStatusRequestedBy: null,
    pendingStatusRequestedAt: null,
    ...overrides,
  };
}

function buildHandler(overrides: { validateLocationThrows?: boolean } = {}) {
  const merchants = {
    create: jest.fn().mockResolvedValue(buildMerchant()),
  };
  const scope = { requirePermission: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const referenceData = {
    validateLocation: overrides.validateLocationThrows
      ? jest
          .fn()
          .mockRejectedValue(
            new InvalidLocationException('Unknown region: Narnia'),
          )
      : jest.fn().mockResolvedValue(undefined),
  };

  const handler = new CreateMerchantHandler(
    merchants as never,
    scope as never,
    audit as never,
    referenceData as never,
  );

  return { handler, merchants, scope, audit, referenceData };
}

describe('CreateMerchantHandler — reference-data location validation', () => {
  const command = new CreateMerchantCommand(
    {
      sub: 'user-1',
      email: 'admin@mms.local',
      acquirerId: 'acquirer-1',
      roles: [],
      permissions: [],
    },
    'YN Restaurants Limited',
    'YN RESTAURANTS',
    '5814',
    '11000',
    undefined,
    false,
    'Dar es Salaam',
    'Kinondoni',
    'Msasani',
  );

  it('validates the region/district/ward/postalCode before creating the merchant', async () => {
    const { handler, merchants, referenceData } = buildHandler();

    await handler.execute(command);

    expect(referenceData.validateLocation).toHaveBeenCalledWith({
      region: 'Dar es Salaam',
      district: 'Kinondoni',
      ward: 'Msasani',
      postalCode: '11000',
    });
    expect(merchants.create).toHaveBeenCalledTimes(1);
  });

  it('never creates the merchant when the location fails validation', async () => {
    const { handler, merchants } = buildHandler({
      validateLocationThrows: true,
    });

    await expect(handler.execute(command)).rejects.toBeInstanceOf(
      InvalidLocationException,
    );
    expect(merchants.create).not.toHaveBeenCalled();
  });
});
