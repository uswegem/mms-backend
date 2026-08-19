import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaymentLinkStatus } from '@prisma/client';

export class CreatePaymentLinkDto {
  @ApiProperty({ description: 'What the buyer is paying for' })
  @IsString()
  @Length(1, 255)
  itemName!: string;

  @ApiProperty({
    description:
      'Merchant-supplied order reference — ties the payment back to a conversation/order',
  })
  @IsString()
  @Length(1, 100)
  orderRef!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    description: 'Hours until the link expires (1–720, default 24)',
    default: 24,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(720)
  expiresInHours?: number;
}

export class ListPaymentLinksQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ enum: PaymentLinkStatus })
  @IsOptional()
  @IsIn(Object.values(PaymentLinkStatus))
  status?: PaymentLinkStatus;
}

export class ConfirmPaymentLinkDto {
  @ApiProperty({
    description:
      'tipsEndToEndId of the Payment created for this link — returned by the TIPS webhook call the buyer just made',
  })
  @IsString()
  @Length(1, 100)
  tipsEndToEndId!: string;
}
