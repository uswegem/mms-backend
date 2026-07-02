import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { OnboardingValidationException } from '../../domain/exceptions/onboarding.exceptions';

export interface DuplicateCheckInput {
  acquirerId: string;
  merchantId?: string;
  taxId?: string | null;
  vrn?: string | null;
  businessRegistrationNo?: string | null;
  licenseNumber?: string | null;
  email?: string | null;
  mobile?: string | null;
  accountNumber?: string | null;
  legalName?: string | null;
}

@Injectable()
export class OnboardingDuplicateService {
  constructor(private readonly prisma: PrismaService) {}

  async assertNoDuplicates(input: DuplicateCheckInput): Promise<void> {
    const conflicts: string[] = [];
    const exclude = input.merchantId ? { not: input.merchantId } : undefined;

    const tin = input.taxId?.trim();
    if (tin) {
      const hit = await this.prisma.merchant.findFirst({
        where: {
          acquirerId: input.acquirerId,
          taxId: tin,
          deletedAt: null,
          ...(exclude ? { id: exclude } : {}),
        },
        select: { tradingName: true },
      });
      if (hit) conflicts.push('TIN already registered');
    }

    const vrn = input.vrn?.trim();
    if (vrn) {
      const hit = await this.prisma.merchant.findFirst({
        where: {
          acquirerId: input.acquirerId,
          vrn,
          deletedAt: null,
          ...(exclude ? { id: exclude } : {}),
        },
        select: { tradingName: true },
      });
      if (hit) conflicts.push('VRN already registered');
    }

    const regNo = input.businessRegistrationNo?.trim();
    if (regNo) {
      const hit = await this.prisma.onboardingApplication.findFirst({
        where: {
          acquirerId: input.acquirerId,
          companyRegistrationNo: regNo,
          deletedAt: null,
          ...(exclude ? { merchantId: exclude } : {}),
        },
      });
      if (hit) conflicts.push('Business registration number already registered');
    }

    const license = input.licenseNumber?.trim();
    if (license) {
      const hit = await this.prisma.merchant.findFirst({
        where: {
          acquirerId: input.acquirerId,
          licenseNumber: license,
          deletedAt: null,
          ...(exclude ? { id: exclude } : {}),
        },
      });
      if (hit) conflicts.push('License number already registered');
    }

    if (input.email?.trim()) {
      const hit = await this.prisma.merchantProfile.findFirst({
        where: {
          contactEmail: input.email.trim().toLowerCase(),
          merchant: {
            acquirerId: input.acquirerId,
            deletedAt: null,
            ...(exclude ? { id: exclude } : {}),
          },
        },
      });
      if (hit) conflicts.push('Email already registered');
    }

    if (input.mobile?.trim()) {
      const hit = await this.prisma.merchantProfile.findFirst({
        where: {
          contactPhone: input.mobile.trim(),
          merchant: {
            acquirerId: input.acquirerId,
            deletedAt: null,
            ...(exclude ? { id: exclude } : {}),
          },
        },
      });
      if (hit) conflicts.push('Mobile number already registered');
    }

    if (input.accountNumber?.trim()) {
      const normalized = input.accountNumber.replace(/\s/g, '');
      const hit = await this.prisma.settlementAccount.findFirst({
        where: {
          accountNumber: normalized,
          deletedAt: null,
          merchant: {
            acquirerId: input.acquirerId,
            deletedAt: null,
            ...(exclude ? { id: exclude } : {}),
          },
        },
      });
      if (hit) conflicts.push('Settlement account number already registered');
    }

    if (conflicts.length > 0) {
      throw new OnboardingValidationException(conflicts.join('; '));
    }
  }
}
