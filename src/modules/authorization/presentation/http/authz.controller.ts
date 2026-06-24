import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { ListRolesQuery } from '../../application/queries/list-roles.query';
import { RoleListItemDto } from '../dto/role.dto';

@ApiTags('Authorization')
@ApiBearerAuth('access-token')
@Controller('authz')
export class AuthzController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('roles')
  @RequirePermissions(Permission.AUTHZ_ROLE_READ)
  @ApiOperation({ summary: 'List roles' })
  @ApiResponse({ status: 200, type: [RoleListItemDto] })
  async listRoles(
    @CurrentUser() user: JwtPayload,
  ): Promise<RoleListItemDto[]> {
    return this.queryBus.execute(new ListRolesQuery(user.acquirerId));
  }
}
