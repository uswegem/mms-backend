import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import {
  InvalidBankCodeException,
  InvalidLocationException,
} from '../../domain/exceptions/reference-data.exceptions';

export interface LocationValidationInput {
  region?: string;
  district?: string;
  ward?: string;
  postalCode?: string;
}

export interface BankSummary {
  name: string;
  swiftCode: string;
}

@Injectable()
export class ReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  async listRegions(): Promise<string[]> {
    const regions = await this.prisma.referenceRegion.findMany({
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    return regions.map((r) => r.name);
  }

  async listDistricts(region: string): Promise<string[]> {
    const districts = await this.prisma.referenceDistrict.findMany({
      where: { region: { name: region } },
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    return districts.map((d) => d.name);
  }

  async listWards(region: string, district: string): Promise<string[]> {
    const wards = await this.prisma.referenceWard.findMany({
      where: { district: { name: district, region: { name: region } } },
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    return wards.map((w) => w.name);
  }

  async listBanks(): Promise<BankSummary[]> {
    const banks = await this.prisma.referenceBank.findMany({
      orderBy: { name: 'asc' },
      select: { name: true, swiftCode: true },
    });
    return banks;
  }

  /**
   * Validates a submitted region/district/ward/postalCode combination
   * against the reference hierarchy. Only checks what's actually supplied —
   * a merchant profile with no location fields at all is untouched — but
   * anything supplied must be real and internally consistent. Called from
   * merchant create/update handlers so region/district/ward/postalCode stop
   * being free text accepted at face value.
   */
  async validateLocation(input: LocationValidationInput): Promise<void> {
    const { region, district, ward, postalCode } = input;

    if (!region) {
      if (district || ward) {
        throw new InvalidLocationException(
          'district/ward were supplied without a region',
        );
      }
      return;
    }

    const regionRow = await this.prisma.referenceRegion.findUnique({
      where: { name: region },
    });
    if (!regionRow) {
      throw new InvalidLocationException(`Unknown region: ${region}`);
    }

    if (!district) {
      if (ward) {
        throw new InvalidLocationException(
          'ward was supplied without a district',
        );
      }
      return;
    }

    const districtRow = await this.prisma.referenceDistrict.findUnique({
      where: { regionId_name: { regionId: regionRow.id, name: district } },
    });
    if (!districtRow) {
      throw new InvalidLocationException(
        `Unknown district "${district}" for region "${region}"`,
      );
    }

    if (!ward) return;

    const wardRow = await this.prisma.referenceWard.findUnique({
      where: { districtId_name: { districtId: districtRow.id, name: ward } },
    });
    if (!wardRow) {
      throw new InvalidLocationException(
        `Unknown ward "${ward}" for district "${district}", region "${region}"`,
      );
    }

    if (!postalCode) return;

    // merchant_profiles.postal_code is CHAR(5); one ward in the source
    // dataset (Morogoro/Malinyi/Kilosampepo) has a 6-digit postcode and
    // genuinely cannot be represented there yet. Surface that plainly
    // instead of a confusing equality-mismatch error.
    if (wardRow.postcode.length > 5) {
      throw new InvalidLocationException(
        `Ward "${ward}" has a registered postcode ("${wardRow.postcode}") longer ` +
          'than the 5-digit postal_code column supports — this is a known data ' +
          'anomaly, not a client input error. Needs a schema decision before this ' +
          'ward can be used.',
      );
    }

    if (wardRow.postcode !== postalCode) {
      throw new InvalidLocationException(
        `postalCode "${postalCode}" does not match the registered postcode ` +
          `for ward "${ward}" ("${wardRow.postcode}")`,
      );
    }
  }

  async validateBankCode(bankCode: string): Promise<void> {
    const bank = await this.prisma.referenceBank.findUnique({
      where: { swiftCode: bankCode },
    });
    if (!bank) {
      throw new InvalidBankCodeException(bankCode);
    }
  }
}
