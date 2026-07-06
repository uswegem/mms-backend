import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/** Legacy `POST /qr/static` body (includes merchantId in payload). */
export class LegacyCreateStaticQrDto {
  @ApiProperty()
  @IsUUID()
  merchantId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Internal routing ID tag 62/05' })
  @IsOptional()
  @IsString()
  internalRoutingId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  force_regenerate?: boolean;
}
