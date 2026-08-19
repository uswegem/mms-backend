import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalEntityType, ApprovalTaskStatus } from '@prisma/client';
import { PaginationQueryDto } from '@shared/presentation/dto/pagination.dto';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListApprovalTasksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ApprovalTaskStatus })
  @IsOptional()
  @IsEnum(ApprovalTaskStatus)
  status?: ApprovalTaskStatus;

  @ApiPropertyOptional({ enum: ApprovalEntityType })
  @IsOptional()
  @IsEnum(ApprovalEntityType)
  entityType?: ApprovalEntityType;
}

export class ApprovalDecisionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}

export class ApprovalTaskResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  acquirerId!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty()
  entityId!: string;

  @ApiProperty()
  makerId!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  expiresAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ nullable: true })
  decision?: {
    checkerId: string;
    decision: string;
    notes: string | null;
    decidedAt: string;
  } | null;
}

export class PaginatedApprovalTasksDto {
  @ApiProperty({ type: [ApprovalTaskResponseDto] })
  data!: ApprovalTaskResponseDto[];

  @ApiProperty()
  meta!: { page: number; limit: number; total: number };
}

export class UpdateApprovalPolicyDto {
  @ApiProperty({
    description: 'Whether this activity requires a second (checker) approval',
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    description: 'SLA, in hours, before a pending task is considered breached',
  })
  @IsInt()
  @Min(1)
  @Max(720)
  slaHours!: number;
}

export class ApprovalPolicyResponseDto {
  @ApiProperty({ enum: ApprovalEntityType })
  entityType!: ApprovalEntityType;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  slaHours!: number;

  @ApiPropertyOptional({
    description:
      'null if this activity is still on the unconfigured default (enabled, 24h SLA)',
  })
  updatedAt!: string | null;
}
