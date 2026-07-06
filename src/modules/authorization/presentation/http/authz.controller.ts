import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import {
  AssignRolePermissionsCommand,
  CreatePolicyOverrideCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  GetEffectivePermissionsQuery,
  GetMyPermissionsQuery,
  GetRoleDetailQuery,
  ListPermissionsQuery,
  ListPolicyOverridesQuery,
  ListRolesQuery,
  RevokePolicyOverrideCommand,
  UpdateRoleCommand,
} from '../../application/handlers/authz.handlers';
import { EffectivePermissionsDto, PermissionDto } from '../dto/permission.dto';
import { CreatePolicyOverrideDto } from '../dto/policy-override.dto';
import {
  AssignRolePermissionsDto,
  CreateRoleDto,
  UpdateRoleDto,
} from '../dto/role-mutation.dto';
import { RoleDetailDto, RoleListItemDto } from '../dto/role.dto';

@ApiTags('Authorization')
@ApiBearerAuth('access-token')
@Controller('authz')
export class AuthzController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('roles')
  @RequirePermissions(Permission.AUTHZ_ROLE_READ)
  @ApiOperation({ summary: 'List roles' })
  @ApiResponse({ status: 200, type: [RoleListItemDto] })
  listRoles(@CurrentUser() user: JwtPayload): Promise<RoleListItemDto[]> {
    return this.queryBus.execute(new ListRolesQuery(user.acquirerId));
  }

  @Get('roles/:id')
  @RequirePermissions(Permission.AUTHZ_ROLE_READ)
  @ApiOperation({ summary: 'Get role with permissions' })
  @ApiResponse({ status: 200, type: RoleDetailDto })
  getRole(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoleDetailDto> {
    return this.queryBus.execute(new GetRoleDetailQuery(user.acquirerId, id));
  }

  @Post('roles')
  @RequirePermissions(Permission.AUTHZ_ROLE_WRITE)
  @ApiOperation({ summary: 'Create custom role' })
  createRole(@CurrentUser() user: JwtPayload, @Body() body: CreateRoleDto) {
    return this.commandBus.execute(
      new CreateRoleCommand(user, body.code, body.name),
    );
  }

  @Put('roles/:id')
  @RequirePermissions(Permission.AUTHZ_ROLE_WRITE)
  @ApiOperation({ summary: 'Update custom role' })
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.commandBus.execute(new UpdateRoleCommand(user, id, body.name));
  }

  @Delete('roles/:id')
  @RequirePermissions(Permission.AUTHZ_ROLE_WRITE)
  @ApiOperation({ summary: 'Delete custom role' })
  deleteRole(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new DeleteRoleCommand(user, id));
  }

  @Put('roles/:id/permissions')
  @RequirePermissions(Permission.AUTHZ_ROLE_WRITE)
  @ApiOperation({ summary: 'Assign permissions to custom role' })
  assignRolePermissions(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignRolePermissionsDto,
  ) {
    return this.commandBus.execute(
      new AssignRolePermissionsCommand(user, id, body.permissionCodes),
    );
  }

  @Get('permissions')
  @RequirePermissions(Permission.AUTHZ_PERMISSION_READ)
  @ApiOperation({ summary: 'List permission catalog' })
  @ApiResponse({ status: 200, type: [PermissionDto] })
  listPermissions() {
    return this.queryBus.execute(new ListPermissionsQuery());
  }

  @Get('me/permissions')
  @RequirePermissions(Permission.AUTHZ_ME)
  @ApiOperation({ summary: 'Effective permissions for current user' })
  @ApiResponse({ status: 200, type: EffectivePermissionsDto })
  myPermissions(@CurrentUser() user: JwtPayload): Promise<EffectivePermissionsDto> {
    return this.queryBus.execute(new GetMyPermissionsQuery(user.sub));
  }

  @Get('users/:userId/effective-permissions')
  @RequirePermissions(Permission.AUTHZ_ROLE_READ)
  @ApiOperation({ summary: 'Effective permissions debug for a user' })
  @ApiResponse({ status: 200, type: EffectivePermissionsDto })
  effectivePermissions(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<EffectivePermissionsDto> {
    return this.queryBus.execute(new GetEffectivePermissionsQuery(userId));
  }

  @Get('policy-overrides')
  @RequirePermissions(Permission.AUTHZ_POLICY_OVERRIDE)
  @ApiOperation({ summary: 'List active policy overrides' })
  listPolicyOverrides(
    @CurrentUser() user: JwtPayload,
    @Query('userId') userId?: string,
  ) {
    return this.queryBus.execute(
      new ListPolicyOverridesQuery(user.acquirerId, userId),
    );
  }

  @Post('policy-overrides')
  @RequirePermissions(Permission.AUTHZ_POLICY_OVERRIDE)
  @ApiOperation({ summary: 'Create policy override (ALLOW/DENY)' })
  createPolicyOverride(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreatePolicyOverrideDto,
  ) {
    return this.commandBus.execute(new CreatePolicyOverrideCommand(user, body));
  }

  @Delete('policy-overrides/:id')
  @RequirePermissions(Permission.AUTHZ_POLICY_OVERRIDE)
  @ApiOperation({ summary: 'Revoke policy override' })
  revokePolicyOverride(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new RevokePolicyOverrideCommand(user, id));
  }
}
