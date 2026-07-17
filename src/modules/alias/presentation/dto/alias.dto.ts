import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class ValidateAliasDto {
  @ApiProperty({ example: '7800000015', description: '8-digit merchant alias or 10-digit student alias' })
  @IsString()
  @Length(8, 10)
  @Matches(/^[0-9]{8,10}$/)
  alias!: string;
}
