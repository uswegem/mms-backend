import { MerchantWithRelations } from '../../infrastructure/persistence/merchants.repository';

export interface MerchantProfileDto {
  addressLine1: string | null;
  addressLine2: string | null;
  region: string | null;
  district: string | null;
  ward: string | null;
  city: string | null;
  postalCode: string;
  countryCode: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface MerchantKycDto {
  status: string;
  submittedAt: string | null;
}

export interface MerchantResponseDto {
  id: string;
  acquirerId: string;
  legalName: string;
  tradingName: string;
  status: string;
  mcc: string;
  taxId: string | null;
  isSchool: boolean;
  onboardedAt: string | null;
  profile: MerchantProfileDto | null;
  kyc: MerchantKycDto | null;
  createdAt: string;
  updatedAt: string;
  pendingStatusAction: string | null;
  pendingStatusReason: string | null;
  pendingStatusRequestedBy: string | null;
  pendingStatusRequestedAt: string | null;
}

export interface MerchantDocumentDto {
  id: string;
  docType: string;
  fileName: string;
  mimeType: string | null;
  fileSize: string | null;
  createdAt: string;
}

export function toMerchantResponse(
  merchant: MerchantWithRelations,
): MerchantResponseDto {
  return {
    id: merchant.id,
    acquirerId: merchant.acquirerId,
    legalName: merchant.legalName,
    tradingName: merchant.tradingName,
    status: merchant.status,
    mcc: merchant.mcc,
    taxId: merchant.taxId,
    isSchool: merchant.isSchool,
    onboardedAt: merchant.onboardedAt?.toISOString() ?? null,
    profile: merchant.profile
      ? {
          addressLine1: merchant.profile.addressLine1,
          addressLine2: merchant.profile.addressLine2,
          region: merchant.profile.region,
          district: merchant.profile.district,
          ward: merchant.profile.ward,
          city: merchant.profile.city,
          postalCode: merchant.profile.postalCode,
          countryCode: merchant.profile.countryCode,
          contactPhone: merchant.profile.contactPhone,
          contactEmail: merchant.profile.contactEmail,
        }
      : null,
    kyc: merchant.kyc
      ? {
          status: merchant.kyc.status,
          submittedAt: merchant.kyc.submittedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: merchant.createdAt.toISOString(),
    updatedAt: merchant.updatedAt.toISOString(),
    pendingStatusAction: merchant.pendingStatusAction ?? null,
    pendingStatusReason: merchant.pendingStatusReason ?? null,
    pendingStatusRequestedBy: merchant.pendingStatusRequestedBy ?? null,
    pendingStatusRequestedAt: merchant.pendingStatusRequestedAt?.toISOString() ?? null,
  };
}
