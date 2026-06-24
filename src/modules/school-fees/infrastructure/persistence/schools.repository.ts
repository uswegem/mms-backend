import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class SchoolsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByMerchantId(merchantId: string) {
    return this.prisma.school.findUnique({
      where: { merchantId },
      include: {
        merchant: { include: { profile: true, settlementAccounts: true } },
      },
    });
  }

  async updateProfile(
    merchantId: string,
    data: {
      registrationNo?: string;
      headName?: string;
      address?: string;
    },
  ) {
    return this.prisma.school.upsert({
      where: { merchantId },
      update: data,
      create: { merchantId, ...data },
      include: { merchant: { include: { profile: true } } },
    });
  }

  async updateContacts(
    merchantId: string,
    data: {
      contactPhone?: string;
      contactEmail?: string;
      bursarName?: string;
      bursarPhone?: string;
    },
  ) {
    return this.prisma.school.upsert({
      where: { merchantId },
      update: {
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail?.toLowerCase(),
        bursarName: data.bursarName,
        bursarPhone: data.bursarPhone,
      },
      create: {
        merchantId,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail?.toLowerCase(),
        bursarName: data.bursarName,
        bursarPhone: data.bursarPhone,
      },
      include: { merchant: { include: { profile: true } } },
    });
  }
}
