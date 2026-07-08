import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MerchantStatusAction } from '@prisma/client';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

const REQUESTABLE_STATUS_ACTIONS = [
  MerchantStatusAction.SUSPEND,
  MerchantStatusAction.REACTIVATE,
  MerchantStatusAction.MARK_DORMANT,
  MerchantStatusAction.CLOSE,
] as const;

export class RequestStatusChangeDto {
  @ApiProperty({ enum: REQUESTABLE_STATUS_ACTIONS })
  @IsIn(REQUESTABLE_STATUS_ACTIONS)
  action!: (typeof REQUESTABLE_STATUS_ACTIONS)[number];

  @ApiProperty({ description: 'Reason for the request — required for governance/audit' })
  @IsString()
  @Length(1, 255)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}

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
