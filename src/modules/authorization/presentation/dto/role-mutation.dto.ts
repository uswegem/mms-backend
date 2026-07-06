import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'COMPLIANCE_OFFICER' })
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_]+$/)
  code!: string;

  @ApiProperty({ example: 'Compliance Officer' })
  @IsString()
  @MaxLength(100)
  name!: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class AssignRolePermissionsDto {
  @ApiProperty({ type: [String], example: ['merchant:read', 'onboarding:read'] })
  @IsString({ each: true })
  permissionCodes!: string[];
}
