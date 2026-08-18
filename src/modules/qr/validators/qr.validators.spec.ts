import { BadRequestException } from '@nestjs/common';
import { QrValidators } from './qr.validators';
import { TipsMerchantIdRepository } from '../domain/tips-merchant-id.repository';

describe('QrValidators.resolveAcquirerId5', () => {
  const validators = new QrValidators({} as any, {} as any);

  it('prefers the TipsRegistration value, then the Acquirer value, then the TPS response', () => {
    expect(
      validators.resolveAcquirerId5({
        tipsRegistrationAcquirerId5: '01044',
        acquirerTipsAcquirerId5: '01099',
      }),
    ).toBe('01044');
    expect(
      validators.resolveAcquirerId5({ acquirerTipsAcquirerId5: '01099' }),
    ).toBe('01099');
    expect(
      validators.resolveAcquirerId5({
        tpsResponsePayload: { acquirerId5: '01055' },
      }),
    ).toBe('01055');
  });

  it('throws rather than silently defaulting when no acquirer ID is available', () => {
    expect(() => validators.resolveAcquirerId5({})).toThrow(
      BadRequestException,
    );
  });
});

describe('QrValidators.ensureTipsRegistration', () => {
  it('allocates a Merchant ID once and never reassigns it on subsequent calls', async () => {
    const stored = new Map<
      string,
      { acquirerId5: string; merchantId15: string }
    >();
    const tipsIdRepo = {
      allocateMerchantId15: jest.fn(async () => '044000000000001'),
    } as unknown as TipsMerchantIdRepository;
    const prisma = {
      tipsRegistration: {
        findUnique: jest.fn(
          async ({ where: { merchantId } }: any) =>
            stored.get(merchantId) ?? null,
        ),
        create: jest.fn(async ({ data }: any) => {
          stored.set(data.merchantId, {
            acquirerId5: data.acquirerId5,
            merchantId15: data.merchantId15,
          });
          return data;
        }),
      },
      merchantIntegration: {
        // No successful TPS registration on record for this merchant —
        // ensureTipsRegistration should leave status at the PENDING default.
        findFirst: jest.fn(async () => null),
      },
    } as any;
    const validators = new QrValidators(prisma, tipsIdRepo);

    const first = await validators.ensureTipsRegistration('m1', '01044', '044');
    const second = await validators.ensureTipsRegistration(
      'm1',
      '01044',
      '044',
    );

    expect(first.merchantId15).toBe('044000000000001');
    expect(second.merchantId15).toBe('044000000000001');
    expect(tipsIdRepo.allocateMerchantId15).toHaveBeenCalledTimes(1);
    expect(prisma.tipsRegistration.create).toHaveBeenCalledTimes(1);
  });

  interface CreatedTipsRegistrationData {
    merchantId: string;
    acquirerId5: string;
    merchantId15: string;
    status: string;
    registeredAt?: Date;
    tipsDirectoryRef?: string;
  }

  it('creates the row as REGISTERED (not PENDING) when a successful TPS registration already exists — regression test for a bug where every TipsRegistration row was stuck PENDING forever regardless of actual TPS outcome', async () => {
    const tipsIdRepo = {
      allocateMerchantId15: jest.fn().mockResolvedValue('044000000000002'),
    } as unknown as TipsMerchantIdRepository;
    let createdData: CreatedTipsRegistrationData | undefined;
    const prisma = {
      tipsRegistration: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: CreatedTipsRegistrationData }) => {
          createdData = data;
          return Promise.resolve(data);
        }),
      },
      merchantIntegration: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ externalReferenceId: 'TIPS-M2-ABC123' }),
      },
    } as unknown as ConstructorParameters<typeof QrValidators>[0];
    const validators = new QrValidators(prisma, tipsIdRepo);

    await validators.ensureTipsRegistration('m2', '01044', '044');

    expect(createdData?.status).toBe('REGISTERED');
    expect(createdData?.registeredAt).toBeInstanceOf(Date);
    expect(createdData?.tipsDirectoryRef).toBe('TIPS-M2-ABC123');
  });

  it('creates the row as PENDING when no successful TPS registration is on record', async () => {
    const tipsIdRepo = {
      allocateMerchantId15: jest.fn().mockResolvedValue('044000000000003'),
    } as unknown as TipsMerchantIdRepository;
    let createdData: CreatedTipsRegistrationData | undefined;
    const prisma = {
      tipsRegistration: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: CreatedTipsRegistrationData }) => {
          createdData = data;
          return Promise.resolve(data);
        }),
      },
      merchantIntegration: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as ConstructorParameters<typeof QrValidators>[0];
    const validators = new QrValidators(prisma, tipsIdRepo);

    await validators.ensureTipsRegistration('m3', '01044', '044');

    expect(createdData?.status).toBe('PENDING');
    expect(createdData?.registeredAt).toBeUndefined();
  });
});
