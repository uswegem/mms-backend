import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateDynamicQrDto {
  @ApiProperty({ example: '150000' })
  @IsString()
  amount!: string;

  @ApiPropertyOptional({ example: 'TERM1-2024-00100014' })
  @IsOptional()
  @IsString()
  bill_number?: string;

  @ApiPropertyOptional({ description: 'Reference / internal routing label (tag 62/05)' })
  @IsOptional()
  @IsString()
  reference_label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  store_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  terminal_id?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  expires_in_minutes?: number;
}
