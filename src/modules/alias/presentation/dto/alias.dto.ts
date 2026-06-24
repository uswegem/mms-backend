import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class ValidateAliasDto {
  @ApiProperty({ example: '780123456' })
  @IsString()
  @Length(8, 8)
  @Matches(/^[0-9]{8}$/)
  alias8digit!: string;
}
