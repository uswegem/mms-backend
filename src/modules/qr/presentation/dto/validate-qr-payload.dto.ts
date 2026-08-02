import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ValidateQrPayloadDto {
  @ApiPropertyOptional({ description: 'Complete TANQR payload to verify CRC and structure' })
  @IsOptional()
  @IsString()
  tlv_payload?: string;

  @ApiPropertyOptional({ enum: ['11', '12'] })
  @IsOptional()
  @IsIn(['11', '12'])
  poi_method?: '11' | '12';

  @ApiPropertyOptional({ example: '01044' })
  @IsOptional()
  @IsString()
  acquirer_id5?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  merchant_id?: string;

  @ApiPropertyOptional({ example: '5814' })
  @IsOptional()
  @IsString()
  mcc?: string;

  @ApiPropertyOptional({ example: 'YN RESTAURANTS' })
  @IsOptional()
  @IsString()
  merchant_name?: string;

  @ApiPropertyOptional({ example: 'DODOMA' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '41000' })
  @IsOptional()
  @IsString()
  postal_code?: string;

  @ApiPropertyOptional({ example: '2000.00' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({ example: '00112349' })
  @IsOptional()
  @IsString()
  store_label?: string;

  @ApiPropertyOptional({ example: '11002' })
  @IsOptional()
  @IsString()
  terminal_label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bill_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference_label?: string;
}
