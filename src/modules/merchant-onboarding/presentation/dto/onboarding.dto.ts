import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, LegalEntityType, OnboardingStatus } from '@prisma/client';
import { PaginationQueryDto } from '@shared/presentation/dto/pagination.dto';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOnboardingApplicationDto {
  @ApiProperty({ enum: LegalEntityType })
  @IsEnum(LegalEntityType)
  legalEntityType!: LegalEntityType;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  legalName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tradingName!: string;

  @ApiProperty({ pattern: '^[0-9]{4}$' })
  @IsString()
  @Matches(/^[0-9]{4}$/)
  mcc!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ pattern: '^[0-9]{5}$' })
  @IsString()
  @Matches(/^[0-9]{5}$/)
  postalCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyRegistrationNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSchool?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class UpdateOnboardingApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tradingName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4}$/)
  mcc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyRegistrationNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{5}$/)
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class AddOnboardingDocumentDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  docType!: DocumentType;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty()
  @IsString()
  s3Bucket!: string;

  @ApiProperty()
  @IsString()
  s3Key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  fileSize?: number;
}

export class AddBeneficialOwnerDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({ description: 'National ID number (stored encrypted)' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  idNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ownershipPct?: number;
}

export class AssignSettlementAccountDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(30)
  accountNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  accountName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  bankCode!: string;
}

export class RejectOnboardingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(30)
  rejectionCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListOnboardingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OnboardingStatus })
  @IsOptional()
  @IsEnum(OnboardingStatus)
  status?: OnboardingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
