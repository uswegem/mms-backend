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

  @ApiPropertyOptional({
    description:
      'Fixed amount (tag 54) to bake into the static QR, e.g. a school\'s termly fee. The QR stays static/non-expiring.',
    example: '150000',
  })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({
    description:
      'Client-generated key to safely retry this request without generating a duplicate QR — prefer the Idempotency-Key header instead.',
  })
  @IsOptional()
  @IsString()
  idempotency_key?: string;
}
