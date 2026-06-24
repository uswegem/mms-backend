import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStaticQrDto {
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
}
