import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
  Matches,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@mms.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ pattern: '^[0-9]{6}$' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  mfaCode?: string;
}

export class TokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 900 })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';
}
