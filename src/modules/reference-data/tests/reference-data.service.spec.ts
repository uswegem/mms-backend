import { ReferenceDataService } from '../application/services/reference-data.service';
import {
  InvalidBankCodeException,
  InvalidLocationException,
} from '../domain/exceptions/reference-data.exceptions';

// AppException carries its human-readable text in the HttpException response
// body's `detail` field, not `.message` (NestJS's HttpException only copies
// a `message` key onto `.message` — ours has `detail` instead, so `.message`
// falls back to a humanized class name like "Invalid Location Exception").
// Assert against the real detail text via getResponse(), not .rejects.toThrow().
async function detailOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const response = (err as InvalidLocationException).getResponse();
    return typeof response === 'object' && response && 'detail' in response
      ? String(response.detail)
      : '';
  }
  throw new Error('Expected promise to reject, but it resolved');
}

function buildService(overrides: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    referenceRegion: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ name: 'Arusha' }, { name: 'Dodoma' }]),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'region-1', name: 'Arusha' }),
    },
    referenceDistrict: {
      findMany: jest.fn().mockResolvedValue([{ name: 'Arumeru' }]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'district-1',
        name: 'Arumeru',
        regionId: 'region-1',
      }),
    },
    referenceWard: {
      findMany: jest.fn().mockResolvedValue([{ name: 'Akheri' }]),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'ward-1', name: 'Akheri', postcode: '23306' }),
    },
    referenceBank: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ name: 'CRDB Bank PLC', swiftCode: 'CORUTZTZ' }]),
      findUnique: jest
        .fn()
        .mockResolvedValue({ name: 'CRDB Bank PLC', swiftCode: 'CORUTZTZ' }),
    },
    ...overrides,
  };

  const service = new ReferenceDataService(prisma as never);
  return { service, prisma };
}

describe('ReferenceDataService', () => {
  describe('listRegions/listDistricts/listWards/listBanks', () => {
    it('returns region names', async () => {
      const { service } = buildService();
      await expect(service.listRegions()).resolves.toEqual([
        'Arusha',
        'Dodoma',
      ]);
    });

    it('returns district names', async () => {
      const { service } = buildService();
      await expect(service.listDistricts('Arusha')).resolves.toEqual([
        'Arumeru',
      ]);
    });

    it('returns ward names', async () => {
      const { service } = buildService();
      await expect(service.listWards('Arusha', 'Arumeru')).resolves.toEqual([
        'Akheri',
      ]);
    });

    it('returns banks with SWIFT codes', async () => {
      const { service } = buildService();
      await expect(service.listBanks()).resolves.toEqual([
        { name: 'CRDB Bank PLC', swiftCode: 'CORUTZTZ' },
      ]);
    });
  });

  describe('validateLocation', () => {
    it('is a no-op when nothing is supplied', async () => {
      const { service, prisma } = buildService();
      await expect(service.validateLocation({})).resolves.toBeUndefined();
      expect(prisma.referenceRegion.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a district supplied without a region', async () => {
      const { service } = buildService();
      await expect(
        service.validateLocation({ district: 'Arumeru' }),
      ).rejects.toBeInstanceOf(InvalidLocationException);
    });

    it('rejects a ward supplied without a district', async () => {
      const { service } = buildService();
      await expect(
        service.validateLocation({ region: 'Arusha', ward: 'Akheri' }),
      ).rejects.toBeInstanceOf(InvalidLocationException);
    });

    it('rejects an unknown region', async () => {
      const { service } = buildService({
        referenceRegion: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        detailOf(service.validateLocation({ region: 'Narnia' })),
      ).resolves.toContain('Unknown region');
    });

    it('rejects a district that does not belong to the given region', async () => {
      const { service } = buildService({
        referenceDistrict: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        detailOf(
          service.validateLocation({ region: 'Arusha', district: 'Kinondoni' }),
        ),
      ).resolves.toContain('Unknown district');
    });

    it('rejects a ward that does not belong to the given district', async () => {
      const { service } = buildService({
        referenceWard: {
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
        },
      });
      await expect(
        detailOf(
          service.validateLocation({
            region: 'Arusha',
            district: 'Arumeru',
            ward: 'Nowhere',
          }),
        ),
      ).resolves.toContain('Unknown ward');
    });

    it('accepts a valid region/district/ward/postalCode combination', async () => {
      const { service } = buildService();
      await expect(
        service.validateLocation({
          region: 'Arusha',
          district: 'Arumeru',
          ward: 'Akheri',
          postalCode: '23306',
        }),
      ).resolves.toBeUndefined();
    });

    it("rejects a postalCode that does not match the ward's registered postcode", async () => {
      const { service } = buildService();
      await expect(
        detailOf(
          service.validateLocation({
            region: 'Arusha',
            district: 'Arumeru',
            ward: 'Akheri',
            postalCode: '99999',
          }),
        ),
      ).resolves.toContain('does not match');
    });

    it('flags the known 6-digit-postcode data anomaly instead of a raw mismatch error', async () => {
      const { service } = buildService({
        referenceWard: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ward-2',
            name: 'Kilosampepo',
            postcode: '678010',
          }),
        },
      });
      await expect(
        detailOf(
          service.validateLocation({
            region: 'Morogoro',
            district: 'Malinyi',
            ward: 'Kilosampepo',
            postalCode: '67801',
          }),
        ),
      ).resolves.toContain('known data anomaly');
    });
  });

  describe('validateBankCode', () => {
    it('resolves for a known SWIFT code', async () => {
      const { service } = buildService();
      await expect(
        service.validateBankCode('CORUTZTZ'),
      ).resolves.toBeUndefined();
    });

    it('rejects an unknown SWIFT code', async () => {
      const { service } = buildService({
        referenceBank: {
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
        },
      });
      await expect(service.validateBankCode('FAKECODE')).rejects.toBeInstanceOf(
        InvalidBankCodeException,
      );
    });
  });
});
