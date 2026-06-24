import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalEntityType, ApprovalTaskStatus } from '@prisma/client';
import { PaginationQueryDto } from '@shared/presentation/dto/pagination.dto';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

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
