import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DisputeRaisedBy, DisputeReason, DisputeStage } from '@prisma/client';

export class CreateDisputeDto {
  @ApiProperty()
  @IsUUID()
  merchantId!: string;

  @ApiProperty({ description: 'The real Payment this dispute is about' })
  @IsUUID()
  paymentId!: string;

  @ApiProperty({ enum: DisputeRaisedBy })
  @IsEnum(DisputeRaisedBy)
  raisedBy!: DisputeRaisedBy;

  @ApiProperty({ enum: DisputeReason })
  @IsEnum(DisputeReason)
  reason!: DisputeReason;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ description: 'Must be > 0 and <= the payment amount' })
  @IsNumber()
  @Min(0.01)
  disputedAmount!: number;
}

export class AddDisputeEvidenceDto {
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
  @IsInt()
  fileSize?: number;
}

export class ResolveNoRefundDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  notes!: string;
}

export class ListDisputesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ enum: DisputeStage })
  @IsOptional()
  @IsEnum(DisputeStage)
  stage?: DisputeStage;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
