import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PolicyEffect } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePolicyOverrideDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'merchant:write' })
  @IsString()
  @MaxLength(100)
  permissionCode!: string;

  @ApiProperty({ enum: PolicyEffect })
  @IsEnum(PolicyEffect)
  effect!: PolicyEffect;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  scopeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
