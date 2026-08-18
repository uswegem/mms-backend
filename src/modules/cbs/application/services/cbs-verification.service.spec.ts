import { CbsVerificationService } from './cbs-verification.service';

function buildService(
  overrides: {
    outcome?: { result: 'PASS' | 'FAIL'; verifiedAccountName?: string };
  } = {},
) {
  const prisma = {
    cbsAccountVerification: {
      create: jest.fn().mockResolvedValue({ id: 'verification-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const validation = {
    verify: jest.fn().mockResolvedValue(
      overrides.outcome ?? {
        result: 'PASS',
        verifiedAccountName: 'YN Restaurants Limited',
      },
    ),
  };

  const service = new CbsVerificationService(prisma as never, validation);
  return { service, prisma, validation };
}

describe('CbsVerificationService', () => {
  it('delegates the actual check to CbsValidationProvider and persists a PASS result', async () => {
    const { service, prisma, validation } = buildService();

    const result = await service.verifySettlementAccount(
      'merchant-1',
      '0412 8871 44',
      'YN Restaurants Limited',
      'actor-1',
    );

    expect(validation.verify).toHaveBeenCalledWith(
      '0412887144',
      'YN Restaurants Limited',
    );
    expect(result).toEqual({
      result: 'PASS',
      accountName: 'YN Restaurants Limited',
    });
    expect(prisma.cbsAccountVerification.create).toHaveBeenCalledWith({
      data: {
        merchantId: 'merchant-1',
        accountNumber: '0412887144',
        result: 'PASS',
        verifiedBy: 'actor-1',
      },
    });
  });

  it('persists a FAIL result with an empty accountName when the provider rejects it', async () => {
    const { service, prisma } = buildService({ outcome: { result: 'FAIL' } });

    const result = await service.verifySettlementAccount(
      'merchant-1',
      '12345',
      'X',
      'actor-1',
    );

    expect(result).toEqual({ result: 'FAIL', accountName: '' });
    const call = (
      prisma.cbsAccountVerification.create.mock.calls as unknown[][]
    )[0][0] as { data: { result: string } };
    expect(call.data.result).toBe('FAIL');
  });

  it('latestVerification queries by the whitespace-normalized account number', async () => {
    const { service, prisma } = buildService();
    await service.latestVerification('merchant-1', '0412 8871 44');

    expect(prisma.cbsAccountVerification.findFirst).toHaveBeenCalledWith({
      where: { merchantId: 'merchant-1', accountNumber: '0412887144' },
      orderBy: { verifiedAt: 'desc' },
    });
  });
});
