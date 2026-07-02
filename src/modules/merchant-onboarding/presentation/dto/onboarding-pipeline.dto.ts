import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class KycDecisionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  rejectionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class RiskDecisionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  riskScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  duplicateFlag?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  blacklistFlag?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SettlementConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  settlementAlias?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  settlementAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payoutCycle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  mdr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  charges?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  transactionLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  dailyLimit?: number;
}

class StoreRowDto {
  @IsString()
  storeName!: string;

  @IsString()
  storeCode!: string;
}

export class BulkStoreUploadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreRowDto)
  stores!: StoreRowDto[];
}
