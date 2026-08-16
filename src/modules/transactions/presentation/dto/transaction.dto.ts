import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaymentChannel, PaymentStatus } from '@prisma/client';

const CHANNELS = Object.values(PaymentChannel);

export class TipsPaymentWebhookDto {
  @ApiProperty({
    description: 'Lipa Namba alias the payer scanned or typed — 8 or 10 digits',
  })
  @IsString()
  @Length(8, 10)
  alias!: string;

  @ApiProperty()
  @IsNumberString()
  amount!: string;

  @ApiProperty({
    description: 'TIPS common reference number — idempotency key',
  })
  @IsString()
  @Length(1, 100)
  tipsEndToEndId!: string;

  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @IsIn(CHANNELS)
  channel?: PaymentChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  payerFsp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  payerMsisdnMasked?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  payerNameMasked?: string;

  @ApiPropertyOptional({
    description: 'Force a FAILED outcome — test/dev only',
  })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILED'])
  simulateOutcome?: 'SUCCESS' | 'FAILED';
}

export class LedgerQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsIn(Object.values(PaymentStatus))
  status?: PaymentStatus;

  @ApiPropertyOptional({
    description: 'ISO date — inclusive lower bound on receivedAt',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'ISO date — inclusive upper bound on receivedAt',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

export class OverridePaymentStatusDto {
  @ApiProperty({ enum: PaymentStatus })
  @IsIn(Object.values(PaymentStatus))
  status!: PaymentStatus;

  @ApiProperty({
    description: 'Reason for the manual override — required for audit',
  })
  @IsString()
  @Length(1, 255)
  reason!: string;
}
