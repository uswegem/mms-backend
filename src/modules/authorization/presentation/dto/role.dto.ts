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
}
