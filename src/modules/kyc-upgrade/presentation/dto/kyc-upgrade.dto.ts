import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class VerifyTinDto {
  @ApiProperty({ description: 'TRA TIN — exactly 9 digits' })
  @IsString()
  @Length(1, 50)
  tin!: string;
}

export class AddKycUpgradeDocumentDto {
  @ApiProperty({
    description: 'e.g. BUSINESS_LICENSE, BRELA_CERTIFICATE, TIN_CERTIFICATE',
  })
  @IsString()
  @Length(1, 50)
  docType!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  fileName!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
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
  @IsInt()
  @Min(0)
  fileSize?: number;
}
