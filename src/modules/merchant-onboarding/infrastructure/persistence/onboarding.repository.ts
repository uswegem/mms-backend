import { Injectable } from '@nestjs/common';
import {
  AmlResult,
  DocumentType,
  KycStatus,
  LegalEntityType,
  MerchantStatus,
  OnboardingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { DEFAULT_MERCHANT_STEPS } from '../../domain/constants/onboarding-steps';

const TX = { maxWait: 10_000, timeout: 30_000 } as const;

const appInclude = {
  merchant: { include: { profile: true, settlementAccounts: true } },
  steps: true,
  beneficialOwners: { where: { deletedAt: null } },
  amlResults: { orderBy: { screenedAt: 'desc' as const }, take: 1 },
  kycReviews: { orderBy: { reviewedAt: 'desc' as const } },
} satisfies Prisma.OnboardingApplicationInclude;

export type OnboardingAppWithRelations = Prisma.OnboardingApplicationGetPayload<{
  include: typeof appInclude;
}>;

@Injectable()
export class OnboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async nextApplicationNo(acquirerId: string): Promise<string> {
    const count = await this.prisma.onboardingApplication.count({
      where: { acquirerId },
    });
    const year = new Date().getFullYear();
    return `ONB-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  async findMany(
    acquirerId: string,
    status?: OnboardingStatus,
    q?: string,
    page = 1,
    limit = 20,
  ) {
    const where: Prisma.OnboardingApplicationWhereInput = {
      acquirerId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { applicationNo: { contains: q, mode: 'insensitive' } },
              { merchant: { legalName: { contains: q, mode: 'insensitive' } } },
              { merchant: { tradingName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.onboardingApplication.findMany({
        where,
        include: appInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.onboardingApplication.count({ where }),
    ]);
    return { items, total };
  }

  async findById(id: string): Promise<OnboardingAppWithRelations | null> {
    return this.prisma.onboardingApplication.findFirst({
      where: { id, deletedAt: null },
      include: appInclude,
    });
  }

  async createApplication(data: {
    acquirerId: string;
    legalEntityType: LegalEntityType;
    isSchool: boolean;
    legalName: string;
    tradingName: string;
    mcc: string;
    city: string;
    postalCode: string;
    taxId?: string;
    companyRegistrationNo?: string;
    addressLine1?: string;
    addressLine2?: string;
    contactPhone?: string;
    contactEmail?: string;
    createdBy: string;
  }): Promise<OnboardingAppWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: {
          acquirerId: data.acquirerId,
          legalName: data.legalName,
          tradingName: data.tradingName,
          mcc: data.mcc,
          taxId: data.taxId,
          isSchool: data.isSchool,
          status: MerchantStatus.DRAFT,
          createdBy: data.createdBy,
          profile: {
            create: {
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
      });

      const applicationNo = await this.nextApplicationNo(data.acquirerId);
      const app = await tx.onboardingApplication.create({
        data: {
          acquirerId: data.acquirerId,
          merchantId: merchant.id,
          applicationNo,
          legalEntityType: data.legalEntityType,
          companyRegistrationNo: data.companyRegistrationNo,
          status: OnboardingStatus.DRAFT,
          createdBy: data.createdBy,
          steps: {
            create: DEFAULT_MERCHANT_STEPS.map((stepCode) => ({ stepCode })),
          },
        },
        include: appInclude,
      });

      if (data.isSchool) {
        await tx.school.create({ data: { merchantId: merchant.id } });
      }

      return app;
    }, TX);
  }

  async updateApplication(
    id: string,
    data: {
      tradingName?: string;
      mcc?: string;
      taxId?: string;
      companyRegistrationNo?: string;
      city?: string;
      postalCode?: string;
      addressLine1?: string;
      addressLine2?: string;
      contactPhone?: string;
      contactEmail?: string;
      updatedBy: string;
    },
  ): Promise<OnboardingAppWithRelations> {
    const app = await this.findById(id);
    if (!app) throw new Error('NOT_FOUND');

    return this.prisma.$transaction(async (tx) => {
      if (
        data.city !== undefined ||
        data.postalCode !== undefined ||
        data.addressLine1 !== undefined ||
        data.addressLine2 !== undefined ||
        data.contactPhone !== undefined ||
        data.contactEmail !== undefined
      ) {
        await tx.merchantProfile.upsert({
          where: { merchantId: app.merchantId },
          update: {
            ...(data.city !== undefined ? { city: data.city } : {}),
            ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
            ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
            ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
            ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone } : {}),
            ...(data.contactEmail !== undefined
              ? { contactEmail: data.contactEmail.toLowerCase() }
              : {}),
          },
          create: {
            merchantId: app.merchantId,
            city: data.city ?? 'Dar es Salaam',
            postalCode: data.postalCode ?? '11000',
            addressLine1: data.addressLine1,
            addressLine2: data.addressLine2,
            contactPhone: data.contactPhone,
            contactEmail: data.contactEmail?.toLowerCase(),
          },
        });
        await tx.onboardingStep.updateMany({
          where: { applicationId: id, stepCode: 'ENTITY_PROFILE' },
          data: { completedAt: new Date() },
        });
      }

      if (data.tradingName || data.mcc || data.taxId !== undefined) {
        await tx.merchant.update({
          where: { id: app.merchantId },
          data: {
            ...(data.tradingName ? { tradingName: data.tradingName } : {}),
            ...(data.mcc ? { mcc: data.mcc } : {}),
            ...(data.taxId !== undefined ? { taxId: data.taxId } : {}),
            updatedBy: data.updatedBy,
          },
        });
      }

      if (data.companyRegistrationNo !== undefined) {
        await tx.onboardingApplication.update({
          where: { id },
          data: { companyRegistrationNo: data.companyRegistrationNo },
        });
      }

      return tx.onboardingApplication.update({
        where: { id },
        data: { updatedBy: data.updatedBy },
        include: appInclude,
      });
    }, TX);
  }

  async addDocument(
    applicationId: string,
    merchantId: string,
    data: {
      docType: DocumentType;
      fileName: string;
      s3Bucket: string;
      s3Key: string;
      mimeType?: string;
      fileSize?: bigint;
      createdBy: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.merchantDocument.create({ data: { merchantId, ...data } });
      await tx.onboardingKycSubmission.create({
        data: {
          applicationId,
          documentId: doc.id,
          docType: data.docType,
        },
      });
      await tx.onboardingStep.updateMany({
        where: { applicationId, stepCode: 'KYC_DOCUMENTS' },
        data: { completedAt: new Date() },
      });
      return doc;
    }, TX);
  }

  async listDocuments(merchantId: string) {
    return this.prisma.merchantDocument.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addBeneficialOwner(
    applicationId: string,
    fullName: string,
    idNumberEnc: Buffer,
    ownershipPct?: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.beneficialOwner.create({
        data: {
          applicationId,
          fullName,
          idNumberEnc: Buffer.from(idNumberEnc),
          ownershipPct,
        },
      });
      await tx.onboardingStep.updateMany({
        where: { applicationId, stepCode: 'BENEFICIAL_OWNERS' },
        data: { completedAt: new Date() },
      });
      return owner;
    }, TX);
  }

  async assignSettlementAccount(
    merchantId: string,
    data: {
      accountNumber: string;
      accountName: string;
      bankCode: string;
      createdBy: string;
    },
    applicationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.settlementAccount.updateMany({
        where: { merchantId, isPrimary: true, deletedAt: null },
        data: { isPrimary: false },
      });
      const account = await tx.settlementAccount.create({
        data: {
          merchantId,
          accountNumber: data.accountNumber.replace(/\s/g, ''),
          accountName: data.accountName,
          bankCode: data.bankCode,
          isPrimary: true,
          createdBy: data.createdBy,
        },
      });
      await tx.onboardingStep.updateMany({
        where: { applicationId, stepCode: 'SETTLEMENT_ACCOUNT' },
        data: { completedAt: new Date() },
      });
      return account;
    }, TX);
  }

  async markSettlementVerified(merchantId: string, accountNumber: string, verifiedBy: string) {
    return this.prisma.settlementAccount.updateMany({
      where: {
        merchantId,
        accountNumber: accountNumber.replace(/\s/g, ''),
        deletedAt: null,
      },
      data: { verifiedAt: new Date(), verifiedBy },
    });
  }

  async recordAml(applicationId: string, result: AmlResult, providerRef?: string) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.amlScreeningResult.create({
        data: {
          applicationId,
          result,
          providerRef,
          rawResponse: { source: 'MMS_STUB', result },
        },
      });
      if (result === AmlResult.PASS) {
        await tx.onboardingStep.updateMany({
          where: { applicationId, stepCode: 'AML_SCREENING' },
          data: { completedAt: new Date() },
        });
      }
      return record;
    }, TX);
  }

  async submit(applicationId: string): Promise<OnboardingAppWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      await tx.onboardingApplication.update({
        where: { id: applicationId },
        data: {
          status: OnboardingStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
      await tx.merchant.update({
        where: { id: (await tx.onboardingApplication.findUniqueOrThrow({ where: { id: applicationId } })).merchantId },
        data: { status: MerchantStatus.PENDING_REVIEW },
      });
      await tx.merchantKyc.upsert({
        where: { merchantId: (await tx.onboardingApplication.findUniqueOrThrow({ where: { id: applicationId } })).merchantId },
        update: { status: KycStatus.SUBMITTED, submittedAt: new Date() },
        create: {
          merchantId: (await tx.onboardingApplication.findUniqueOrThrow({ where: { id: applicationId } })).merchantId,
          status: KycStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
      return tx.onboardingApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: appInclude,
      });
    }, TX);
  }

  async makerApprove(applicationId: string, makerId: string): Promise<OnboardingAppWithRelations> {
    return this.prisma.onboardingApplication.update({
      where: { id: applicationId },
      data: {
        status: OnboardingStatus.UNDER_REVIEW,
        makerId,
        updatedBy: makerId,
      },
      include: appInclude,
    });
  }

  async checkerApprove(applicationId: string, checkerId: string): Promise<OnboardingAppWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.onboardingApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
      await tx.onboardingKycReview.create({
        data: {
          applicationId,
          reviewerId: checkerId,
          decision: 'APPROVED',
          notes: 'Checker approved via maker-checker workflow',
        },
      });
      await tx.onboardingApplication.update({
        where: { id: applicationId },
        data: {
          status: OnboardingStatus.APPROVED,
          approvedAt: new Date(),
          checkerId,
        },
      });
      await tx.merchant.update({
        where: { id: app.merchantId },
        data: {
          status: MerchantStatus.ACTIVE,
          onboardedAt: new Date(),
          updatedBy: checkerId,
        },
      });
      await tx.merchantKyc.upsert({
        where: { merchantId: app.merchantId },
        update: { status: KycStatus.APPROVED },
        create: { merchantId: app.merchantId, status: KycStatus.APPROVED },
      });
      return tx.onboardingApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: appInclude,
      });
    }, TX);
  }

  async reject(
    applicationId: string,
    reviewerId: string,
    rejectionCode: string,
    notes?: string,
  ): Promise<OnboardingAppWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.onboardingApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
      await tx.onboardingKycReview.create({
        data: {
          applicationId,
          reviewerId,
          decision: 'REJECTED',
          notes,
        },
      });
      await tx.onboardingApplication.update({
        where: { id: applicationId },
        data: {
          status: OnboardingStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionCode,
          rejectionNotes: notes,
        },
      });
      await tx.merchant.update({
        where: { id: app.merchantId },
        data: { status: MerchantStatus.DRAFT },
      });
      await tx.merchantKyc.upsert({
        where: { merchantId: app.merchantId },
        update: { status: KycStatus.REJECTED },
        create: { merchantId: app.merchantId, status: KycStatus.REJECTED },
      });
      return tx.onboardingApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: appInclude,
      });
    }, TX);
  }

  async resubmit(applicationId: string, actorId: string): Promise<OnboardingAppWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.onboardingApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
      await tx.onboardingApplication.update({
        where: { id: applicationId },
        data: {
          status: OnboardingStatus.DRAFT,
          rejectedAt: null,
          rejectionCode: null,
          rejectionNotes: null,
          submittedAt: null,
          makerId: null,
          checkerId: null,
          updatedBy: actorId,
        },
      });
      await tx.merchant.update({
        where: { id: app.merchantId },
        data: { status: MerchantStatus.DRAFT },
      });
      await tx.merchantKyc.upsert({
        where: { merchantId: app.merchantId },
        update: { status: KycStatus.PENDING, submittedAt: null },
        create: { merchantId: app.merchantId, status: KycStatus.PENDING },
      });
      return tx.onboardingApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: appInclude,
      });
    }, TX);
  }

  async getTimeline(applicationId: string) {
    const [reviews, aml, steps] = await Promise.all([
      this.prisma.onboardingKycReview.findMany({
        where: { applicationId },
        orderBy: { reviewedAt: 'asc' },
      }),
      this.prisma.amlScreeningResult.findMany({
        where: { applicationId },
        orderBy: { screenedAt: 'asc' },
      }),
      this.prisma.onboardingStep.findMany({
        where: { applicationId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { reviews, aml, steps };
  }

  async getDocumentTypes(merchantId: string): Promise<DocumentType[]> {
    const docs = await this.prisma.merchantDocument.findMany({
      where: { merchantId, deletedAt: null },
      select: { docType: true },
    });
    return docs.map((d) => d.docType);
  }

  async countBeneficialOwners(applicationId: string): Promise<number> {
    return this.prisma.beneficialOwner.count({
      where: { applicationId, deletedAt: null },
    });
  }
}
