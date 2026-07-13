import { QrRepository } from './qr.repository';
import { QrValidators } from '../../validators/qr.validators';
import { buildTLV } from '../../domain/tlv.builder';

describe('QrRepository.createStaticQr', () => {
  it('sanitizes and truncates merchant name/city uniformly for every caller', async () => {
    const validators = new QrValidators({} as any, {} as any);
    const created: any[] = [];
    const prisma = {
      qrCode: {
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return { ...data, payloadVersions: [data.payloadVersions.create] };
        }),
      },
    } as any;
    const repo = new QrRepository(prisma, validators);

    const longName = 'A Very Long Merchant Trading Name That Exceeds Limit';
    const longCity = 'A City Name Longer Than Fifteen Chars';

    const result = await repo.createStaticQr({
      merchantId: 'm1',
      merchantName: longName,
      city: longCity,
      postalCode: '41000',
      mcc: '5814',
      merchantId15: '044000000000001',
      storeLabel: '78012349',
      acquirerId5: '01044',
    });

    const sanitizedName = longName.trim().slice(0, 25);
    const sanitizedCity = longCity.trim().slice(0, 15);
    const tlvPayload = result.payloadVersions[0].tlvPayload;

    expect(tlvPayload).toContain(buildTLV('59', sanitizedName));
    expect(tlvPayload).toContain(buildTLV('60', sanitizedCity));
    expect(tlvPayload).not.toContain(longName);
    expect(tlvPayload).not.toContain(longCity);
  });
});
