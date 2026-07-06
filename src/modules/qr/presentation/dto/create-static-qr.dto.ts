import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStaticQrDto {
  @ApiPropertyOptional({ description: 'Merchant store UUID' })
  @IsOptional()
  @IsUUID()
  store_id?: string;

  @ApiPropertyOptional({ description: 'Terminal UUID' })
  @IsOptional()
  @IsUUID()
  terminal_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  force_regenerate?: boolean;
}
