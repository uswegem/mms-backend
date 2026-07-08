import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, MerchantStatus } from '@prisma/client';
import { PaginationQueryDto } from '@shared/presentation/dto/pagination.dto';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class MerchantProfileDto {
  @ApiPropertyOptional({ nullable: true })
  addressLine1!: string | null;

  @ApiPropertyOptional({ nullable: true })
  addressLine2!: string | null;

  @ApiPropertyOptional({ nullable: true })
  region!: string | null;

  @ApiPropertyOptional({ nullable: true })
  district!: string | null;

  @ApiPropertyOptional({ nullable: true })
  ward!: string | null;

  @ApiPropertyOptional({ nullable: true })
  city!: string | null;

  @ApiProperty()
  postalCode!: string;

  @ApiProperty()
  countryCode!: string;

  @ApiPropertyOptional({ nullable: true })
  contactPhone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactEmail!: string | null;
}

export class MerchantKycDto {
  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  submittedAt!: string | null;
}

export class MerchantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  acquirerId!: string;

  @ApiProperty()
  legalName!: string;

  @ApiProperty()
  tradingName!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  mcc!: string;

  @ApiPropertyOptional({ nullable: true })
  taxId!: string | null;

  @ApiProperty()
  isSchool!: boolean;

  @ApiPropertyOptional({ nullable: true })
  onboardedAt!: string | null;

  @ApiPropertyOptional({ type: MerchantProfileDto, nullable: true })
  profile!: MerchantProfileDto | null;

  @ApiPropertyOptional({ type: MerchantKycDto, nullable: true })
  kyc!: MerchantKycDto | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  pendingStatusAction!: string | null;

  @ApiPropertyOptional({ nullable: true })
  pendingStatusReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  pendingStatusRequestedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  pendingStatusRequestedAt!: string | null;
}

export class CreateMerchantDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  legalName!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tradingName!: string;

  @ApiProperty({ pattern: '^[0-9]{4}$', default: '0000' })
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
  @MaxLength(50)
  taxId?: string;

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

export class UpdateMerchantDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tradingName?: string;

  @ApiPropertyOptional({ pattern: '^[0-9]{4}$' })
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

  @ApiPropertyOptional({ pattern: '^[0-9]{5}$' })
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

export class ListMerchantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MerchantStatus })
  @IsOptional()
  @IsEnum(MerchantStatus)
  status?: MerchantStatus;

  @ApiPropertyOptional({ description: 'Search legal name, trading name, or tax ID' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AddKycDocumentDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  docType!: DocumentType;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  s3Bucket!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  s3Key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  fileSize?: number;
}

export class ReviewKycDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'MORE_INFO'] })
  @IsIn(['APPROVED', 'REJECTED', 'MORE_INFO'])
  decision!: 'APPROVED' | 'REJECTED' | 'MORE_INFO';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}

export class MerchantKycReviewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reviewerId!: string;

  @ApiProperty()
  decision!: string;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  reviewedAt!: string;
}

export class MerchantDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  docType!: string;

  @ApiProperty()
  fileName!: string;

  @ApiPropertyOptional({ nullable: true })
  mimeType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileSize!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class PaginatedMerchantsResponseDto {
  @ApiProperty({ type: [MerchantResponseDto] })
  data!: MerchantResponseDto[];

  @ApiProperty()
  meta!: { page: number; limit: number; total: number };
}
