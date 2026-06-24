import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class MfaVerifyDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ pattern: '^[0-9]{6}$' })
  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  mfaCode!: string;
}

export class MfaSetupResponseDto {
  @ApiProperty({ description: 'TOTP shared secret (base32)' })
  secret!: string;

  @ApiProperty({ description: 'QR code URL (data URL for this scaffold)' })
  qrUrl!: string;
}

export class MfaVerifyResponseDto {
  @ApiProperty()
  verified!: boolean;
}
