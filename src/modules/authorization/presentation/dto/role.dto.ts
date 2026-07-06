import { ApiProperty } from '@nestjs/swagger';

export class RoleListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty({ required: false })
  createdAt?: Date;

  @ApiProperty({ required: false })
  updatedAt?: Date;
}

export class RoleDetailDto extends RoleListItemDto {
  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty()
  assignedUserCount!: number;
}
