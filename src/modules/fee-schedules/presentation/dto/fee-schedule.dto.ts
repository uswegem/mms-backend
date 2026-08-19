import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  FeeChargeBasis,
  FeeChargeType,
  FeeScheduleScope,
} from '@prisma/client';

export class FeeScheduleChargeDto {
  @ApiProperty({ enum: FeeChargeType })
  @IsIn(Object.values(FeeChargeType))
  chargeType!: FeeChargeType;

  @ApiProperty({ enum: FeeChargeBasis })
  @IsIn(Object.values(FeeChargeBasis))
  basis!: FeeChargeBasis;

  @ApiPropertyOptional({
    description:
      'Fraction, e.g. 0.0085 = 0.85% — required for PERCENT_OF_TRANSACTION',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  rate?: number;

  @ApiPropertyOptional({
    description: 'Flat TZS amount — required for the FLAT_PER_* bases',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  flatAmount?: number;

  @ApiPropertyOptional({
    description: 'Optional ceiling on a percent-based charge',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  capAmount?: number;
}

export class CreateFeeScheduleDto {
  @ApiProperty({ enum: FeeScheduleScope })
  @IsIn(Object.values(FeeScheduleScope))
  scope!: FeeScheduleScope;

  @ApiPropertyOptional({
    description:
      'MCC code for scope=MCC, merchant id for scope=MERCHANT; omit for scope=DEFAULT',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  scopeKey?: string;

  @ApiProperty({ type: [FeeScheduleChargeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeeScheduleChargeDto)
  charges!: FeeScheduleChargeDto[];
}

export class ListFeeSchedulesQueryDto {
  @ApiPropertyOptional({ enum: FeeScheduleScope })
  @IsOptional()
  @IsIn(Object.values(FeeScheduleScope))
  scope?: FeeScheduleScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeKey?: string;
}
