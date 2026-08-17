import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  normalizeMobile,
  TZ_MOBILE_RE,
} from '../../domain/guardian-phone.util';

export class CreateStudentDto {
  @ApiProperty({ example: 'ADM-2026-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  admissionNo!: string;

  @ApiProperty({ example: 'Amina Hassan' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({
    example: '255712345678',
    description:
      'Mandatory — primary delivery address for the student Lipa Namba notification. Accepts 07XXXXXXXX or 2557XXXXXXXX.',
  })
  @Transform(({ value }: { value?: string }) =>
    typeof value === 'string' ? (normalizeMobile(value) ?? value) : value,
  )
  @IsString()
  @Matches(TZ_MOBILE_RE, {
    message:
      'guardianPhone must be a valid Tanzanian mobile number (07XXXXXXXX or 2557XXXXXXXX)',
  })
  guardianPhone!: string;

  @ApiPropertyOptional({ example: 'amina.hassan@example.com' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @ValidateIf((o) => !!o.parentEmail)
  @IsEmail()
  @MaxLength(254)
  parentEmail?: string;

  @ApiPropertyOptional({
    description:
      'Client-generated key to safely retry this request without enrolling the student twice.',
  })
  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

export class BulkConfirmDto {
  @ApiProperty({
    description:
      'Must be true — the school (finance-office uploader) attests that parental/guardian ' +
      'consent, or an equivalent lawful basis under the Personal Data Protection Act 2022, has ' +
      'been obtained for every student in this roster. This is a school-level attestation, not ' +
      'per-student consent capture (brief §4.3.2) — the batch is rejected if this is not true.',
  })
  @IsBoolean()
  parentalConsentAttested!: boolean;

  @ApiProperty({
    description:
      'Rows previously returned by the /bulk/preview endpoint that passed validation.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        row: { type: 'number' },
        admissionNo: { type: 'string' },
        fullName: { type: 'string' },
        guardianPhone: { type: 'string' },
        parentEmail: { type: 'string', nullable: true },
      },
    },
  })
  @IsArray()
  rows!: Array<{
    row: number;
    admissionNo: string;
    fullName: string;
    guardianPhone: string;
    parentEmail?: string;
  }>;
}

export class SendQrDto {
  @ApiProperty({
    description: 'Which channels to notify via.',
    enum: ['email', 'sms'],
    isArray: true,
    example: ['email', 'sms'],
  })
  @IsArray()
  @IsIn(['email', 'sms'], { each: true })
  channels!: ('email' | 'sms')[];
}
