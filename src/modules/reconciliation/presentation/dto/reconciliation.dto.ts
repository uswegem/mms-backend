import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ReconciliationExceptionStatus } from '@prisma/client';

export class ReconciliationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ enum: ReconciliationExceptionStatus })
  @IsOptional()
  @IsIn(Object.values(ReconciliationExceptionStatus))
  status?: ReconciliationExceptionStatus;

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

export class RunMatchDto {
  @ApiProperty()
  @IsUUID()
  merchantId!: string;

  @ApiProperty({ description: 'Cycle date (ISO date, e.g. 2026-08-16)' })
  @IsISO8601()
  cycleDate!: string;
}

export class ResolveExceptionDto {
  @ApiProperty({ enum: ['RESOLVED', 'WRITTEN_OFF'] })
  @IsIn(['RESOLVED', 'WRITTEN_OFF'])
  status!: 'RESOLVED' | 'WRITTEN_OFF';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}
