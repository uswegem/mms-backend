import { Injectable } from '@nestjs/common';
import {
  DocumentType,
  KycStatus,
  MerchantStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const merchantInclude = {
  profile: true,
  kyc: true,
} satisfies Prisma.MerchantInclude;

export type MerchantWithRelations = Prisma.MerchantGetPayload<{
  include: typeof merchantInclude;
}>;

export interface MerchantListFilter {
  acquirerId: string;
  merchantId?: string;
  status?: MerchantStatus;
  q?: string;
}

@Injectable()
export class MerchantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filter: MerchantListFilter,
    page: number,
    limit: number,
  ): Promise<{ items: MerchantWithRelations[]; total: number }> {
    const where: Prisma.MerchantWhereInput = {
      acquirerId: filter.acquirerId,
      deletedAt: null,
      ...(filter.merchantId ? { id: filter.merchantId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? {
            OR: [
              { legalName: { contains: filter.q, mode: 'insensitive' } },
              { tradingName: { contains: filter.q, mode: 'insensitive' } },
              { taxId: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        include: merchantInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string): Promise<MerchantWithRelations | null> {
    return this.prisma.merchant.findFirst({
      where: { id, deletedAt: null },
      include: merchantInclude,
    });
  }

  async create(data: {
    acquirerId: string;
    legalName: string;
    tradingName: string;
    mcc: string;
    taxId?: string;
    isSchool?: boolean;
    createdBy: string;
    region?: string;
    district?: string;
    ward?: string;
    city?: string;
    postalCode: string;
    addressLine1?: string;
    addressLine2?: string;
    contactPhone?: string;
    contactEmail?: string;
  }): Promise<MerchantWithRelations> {
    return this.prisma.$transaction(
      async (tx) =>
        tx.merchant.create({
          data: {
            acquirerId: data.acquirerId,
            legalName: data.legalName,
            tradingName: data.tradingName,
            mcc: data.mcc,
            taxId: data.taxId,
            isSchool: data.isSchool ?? false,
            status: MerchantStatus.DRAFT,
            createdBy: data.createdBy,
            profile: {
              create: {
                region: data.region,
                district: data.district,
                ward: data.ward,
                city: data.city,
                postalCode: data.postalCode,
                addressLine1: data.addressLine1,
                addressLine2: data.addressLine2,
                contactPhone: data.contactPhone,
                contactEmail: data.contactEmail?.toLowerCase(),
              },
            },
            kyc: { create: { status: KycStatus.PENDING } },
          },
          include: merchantInclude,
        }),
      TX_OPTIONS,
    );
  }

  async update(
    id: string,
    data: {
      tradingName?: string;
      mcc?: string;
      taxId?: string;
      region?: string;
      district?: string;
      ward?: string;
      city?: string;
      postalCode?: string;
      addressLine1?: string;
      addressLine2?: string;
      contactPhone?: string;
      contactEmail?: string;
      updatedBy: string;
    },
  ): Promise<MerchantWithRelations> {
    return this.prisma.$transaction(
      async (tx) => {
        if (
          data.region !== undefined ||
          data.district !== undefined ||
          data.ward !== undefined ||
          data.city !== undefined ||
          data.postalCode !== undefined ||
          data.addressLine1 !== undefined ||
          data.addressLine2 !== undefined ||
          data.contactPhone !== undefined ||
          data.contactEmail !== undefined
        ) {
          await tx.merchantProfile.upsert({
            where: { merchantId: id },
            update: {
              ...(data.region !== undefined ? { region: data.region } : {}),
              ...(data.district !== undefined ? { district: data.district } : {}),
              ...(data.ward !== undefined ? { ward: data.ward } : {}),
              ...(data.city !== undefined ? { city: data.city } : {}),
              ...(data.postalCode !== undefined
                ? { postalCode: data.postalCode }
                : {}),
              ...(data.addressLine1 !== undefined
                ? { addressLine1: data.addressLine1 }
                : {}),
              ...(data.addressLine2 !== undefined
                ? { addressLine2: data.addressLine2 }
                : {}),
              ...(data.contactPhone !== undefined
                ? { contactPhone: data.contactPhone }
                : {}),
              ...(data.contactEmail !== undefined
                ? { contactEmail: data.contactEmail.toLowerCase() }
                : {}),
            },
            create: {
              merchantId: id,
              region: data.region,
              district: data.district,
              ward: data.ward,
              city: data.city,
              postalCode: data.postalCode ?? '00000',
              addressLine1: data.addressLine1,
              addressLine2: data.addressLine2,
              contactPhone: data.contactPhone,
              contactEmail: data.contactEmail?.toLowerCase(),
            },
          });
        }

        return tx.merchant.update({
          where: { id },
          data: {
            ...(data.tradingName ? { tradingName: data.tradingName } : {}),
            ...(data.mcc ? { mcc: data.mcc } : {}),
            ...(data.taxId !== undefined ? { taxId: data.taxId } : {}),
            updatedBy: data.updatedBy,
          },
          include: merchantInclude,
        });
      },
      TX_OPTIONS,
    );
  }

  async updateStatus(
    id: string,
    status: MerchantStatus,
    actorId: string,
    onboardedAt?: Date,
  ): Promise<MerchantWithRelations> {
    return this.prisma.merchant.update({
      where: { id },
      data: {
        status,
        updatedBy: actorId,
        ...(onboardedAt ? { onboardedAt } : {}),
      },
      include: merchantInclude,
    });
  }

  async listDocuments(merchantId: string) {
    return this.prisma.merchantDocument.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDocument(data: {
    merchantId: string;
    docType: DocumentType;
    fileName: string;
    s3Bucket: string;
    s3Key: string;
    mimeType?: string;
    fileSize?: bigint;
    createdBy: string;
  }) {
    return this.prisma.merchantDocument.create({ data });
  }

  async submitKyc(merchantId: string): Promise<MerchantWithRelations> {
    return this.prisma.$transaction(
      async (tx) => {
        const docCount = await tx.merchantDocument.count({
          where: {
            merchantId,
            deletedAt: null,
            docType: {
              in: [
                DocumentType.KYC_ID,
                DocumentType.KYC_LICENSE,
                DocumentType.KYC_TIN,
              ],
            },
          },
        });
        if (docCount === 0) {
          throw new Error('KYC_DOCUMENTS_REQUIRED');
        }

        await tx.merchantKyc.upsert({
          where: { merchantId },
          update: {
            status: KycStatus.SUBMITTED,
            submittedAt: new Date(),
          },
          create: {
            merchantId,
            status: KycStatus.SUBMITTED,
            submittedAt: new Date(),
          },
        });

        await tx.merchant.update({
          where: { id: merchantId },
          data: { status: MerchantStatus.PENDING_REVIEW },
        });

        return tx.merchant.findUniqueOrThrow({
          where: { id: merchantId },
          include: merchantInclude,
        });
      },
      TX_OPTIONS,
    );
  }

  async reviewKyc(
    merchantId: string,
    reviewerId: string,
    decision: 'APPROVED' | 'REJECTED' | 'MORE_INFO',
    notes?: string,
  ): Promise<MerchantWithRelations> {
    return this.prisma.$transaction(
      async (tx) => {
        const kycStatus =
          decision === 'APPROVED'
            ? KycStatus.APPROVED
            : decision === 'REJECTED'
              ? KycStatus.REJECTED
              : KycStatus.UNDER_REVIEW;

        await tx.merchantKycReview.create({
          data: { merchantId, reviewerId, decision, notes },
        });

        await tx.merchantKyc.update({
          where: { merchantId },
          data: { status: kycStatus },
        });

        if (decision === 'APPROVED') {
          await tx.merchant.update({
            where: { id: merchantId },
            data: {
              status: MerchantStatus.ACTIVE,
              onboardedAt: new Date(),
            },
          });
        } else if (decision === 'REJECTED') {
          await tx.merchant.update({
            where: { id: merchantId },
            data: { status: MerchantStatus.DRAFT },
          });
        }

        return tx.merchant.findUniqueOrThrow({
          where: { id: merchantId },
          include: merchantInclude,
        });
      },
      TX_OPTIONS,
    );
  }

  async listKycReviews(merchantId: string) {
    return this.prisma.merchantKycReview.findMany({
      where: { merchantId },
      orderBy: { reviewedAt: 'desc' },
    });
  }
}
