import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
  @IsOptional()
  @IsString()
  @MaxLength(20)
  guardianPhone?: string;
}
