import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
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

  @ApiPropertyOptional({ example: '255712345678' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  guardianPhone?: string;

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
    description: 'Rows previously returned by the /bulk/preview endpoint that passed validation.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        row: { type: 'number' },
        admissionNo: { type: 'string' },
        fullName: { type: 'string' },
        guardianPhone: { type: 'string', nullable: true },
        parentEmail: { type: 'string', nullable: true },
      },
    },
  })
  @IsArray()
  rows!: Array<{
    row: number;
    admissionNo: string;
    fullName: string;
    guardianPhone?: string;
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
