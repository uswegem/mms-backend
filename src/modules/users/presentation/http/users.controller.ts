import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { PaginationQueryDto } from '@shared/presentation/dto/pagination.dto';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { ListUsersQuery } from '../../application/queries/list-users.query';
import { GetUserQuery } from '../../application/queries/get-user.query';
import { GetMeQuery } from '../../application/queries/get-me.query';
import { CreateUserCommand } from '../../application/commands/create-user.command';
import { UpdateUserCommand } from '../../application/commands/update-user.command';
import { DeactivateUserCommand } from '../../application/commands/deactivate-user.command';
import { InviteUserCommand } from '../../application/commands/invite-user.command';
import { AssignRolesCommand } from '../../application/commands/assign-roles.command';
import {
  AssignRolesDto,
  CreateUserDto,
  CreateUserResponseDto,
  InviteUserDto,
  InviteUserResponseDto,
  PaginatedUsersResponseDto,
  UpdateUserDto,
  UserResponseDto,
} from '../dto/user.dto';

function toActor(user: JwtPayload): ActorContext {
  return {
    sub: user.sub,
    email: user.email,
    acquirerId: user.acquirerId,
    merchantId: user.merchantId,
    roles: user.roles,
    permissions: user.permissions,
  };
}

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @RequirePermissions(Permission.USER_READ)
  @ApiOperation({ summary: 'List users' })
  @ApiResponse({ status: 200, type: PaginatedUsersResponseDto })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.queryBus.execute(
      new ListUsersQuery(
        toActor(user),
        query.page ?? 1,
        query.limit ?? 20,
      ),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.USER_WRITE)
  @ApiOperation({ summary: 'Create user' })
  @ApiResponse({ status: 201, type: CreateUserResponseDto })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateUserDto,
  ): Promise<CreateUserResponseDto> {
    return this.commandBus.execute(
      new CreateUserCommand(
        toActor(user),
        dto.email,
        dto.fullName,
        dto.roleIds,
        dto.merchantId,
        dto.phone,
        dto.password,
      ),
    );
  }

  @Get('me')
  @RequirePermissions(Permission.USER_READ)
  @ApiOperation({ summary: 'Current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async me(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return this.queryBus.execute(new GetMeQuery(toActor(user)));
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.USER_INVITE)
  @ApiOperation({ summary: 'Invite user by email' })
  @ApiResponse({ status: 201, type: InviteUserResponseDto })
  async invite(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteUserDto,
  ): Promise<InviteUserResponseDto> {
    return this.commandBus.execute(
      new InviteUserCommand(
        toActor(user),
        dto.email,
        dto.roleId,
        dto.merchantId,
      ),
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.USER_READ)
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.queryBus.execute(new GetUserQuery(toActor(user), id));
  }

  @Put(':id')
  @RequirePermissions(Permission.USER_WRITE)
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.commandBus.execute(
      new UpdateUserCommand(toActor(user), id, dto.fullName, dto.phone),
    );
  }

  @Post(':id/deactivate')
  @RequirePermissions(Permission.USER_DEACTIVATE)
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async deactivate(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.commandBus.execute(
      new DeactivateUserCommand(toActor(user), id),
    );
  }

  @Put(':id/roles')
  @RequirePermissions(Permission.USER_ROLE_ASSIGN)
  @ApiOperation({ summary: 'Assign roles to user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async assignRoles(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ): Promise<UserResponseDto> {
    return this.commandBus.execute(
      new AssignRolesCommand(toActor(user), id, dto.roleIds),
    );
  }
}
