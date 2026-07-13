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
    expect(() => validators.resolveAcquirerId5({})).toThrow(BadRequestException);
  });
});

describe('QrValidators.ensureTipsRegistration', () => {
  it('allocates a Merchant ID once and never reassigns it on subsequent calls', async () => {
    const stored = new Map<string, { acquirerId5: string; merchantId15: string }>();
    const tipsIdRepo = {
      allocateMerchantId15: jest.fn(async () => '044000000000001'),
    } as unknown as TipsMerchantIdRepository;
    const prisma = {
      tipsRegistration: {
        findUnique: jest.fn(async ({ where: { merchantId } }: any) =>
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
    } as any;
    const validators = new QrValidators(prisma, tipsIdRepo);

    const first = await validators.ensureTipsRegistration('m1', '01044', '044');
    const second = await validators.ensureTipsRegistration('m1', '01044', '044');

    expect(first.merchantId15).toBe('044000000000001');
    expect(second.merchantId15).toBe('044000000000001');
    expect(tipsIdRepo.allocateMerchantId15).toHaveBeenCalledTimes(1);
    expect(prisma.tipsRegistration.create).toHaveBeenCalledTimes(1);
  });
});
