import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@mms.local' })
  @IsEmail()
  email!: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty()
  message!: string;

  @ApiProperty({ required: false, description: 'Dev only — omitted in production' })
  resetToken?: string;
}
