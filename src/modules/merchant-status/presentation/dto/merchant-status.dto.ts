import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MerchantStatusAction } from '@prisma/client';
import { IsOptional, IsString, Length } from 'class-validator';

export class StatusChangeNotesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 100)
  reason?: string;
}

export class MerchantStatusHistoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fromStatus!: string;

  @ApiProperty()
  toStatus!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  actorId!: string;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class AllowedStatusActionsDto {
  @ApiProperty()
  merchantId!: string;

  @ApiProperty()
  currentStatus!: string;

  @ApiProperty({ enum: MerchantStatusAction, isArray: true })
  allowedActions!: MerchantStatusAction[];
}
