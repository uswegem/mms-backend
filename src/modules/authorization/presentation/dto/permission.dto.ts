import { ApiProperty } from '@nestjs/swagger';

export class PermissionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  module!: string;

  @ApiProperty({ required: false })
  description?: string | null;
}

export class EffectivePermissionsDto {
  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty({ type: [String] })
  rolePermissions!: string[];

  @ApiProperty({ type: [String] })
  allowedOverrides!: string[];

  @ApiProperty({ type: [String] })
  deniedPermissions!: string[];

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [String] })
  storeIds!: string[];

  @ApiProperty({ type: [String] })
  terminalIds!: string[];
}
