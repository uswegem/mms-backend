import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { IdentityModule } from '@modules/identity/identity.module';
import { UsersController } from './presentation/http/users.controller';
import { UsersRepository } from './infrastructure/persistence/users.repository';
import { UserScopeService } from './application/services/user-scope.service';
import { ListUsersHandler } from './application/handlers/list-users.handler';
import { GetUserHandler } from './application/handlers/get-user.handler';
import { GetMeHandler } from './application/handlers/get-me.handler';
import { CreateUserHandler } from './application/handlers/create-user.handler';
import { UpdateUserHandler } from './application/handlers/update-user.handler';
import { DeactivateUserHandler } from './application/handlers/deactivate-user.handler';
import { InviteUserHandler } from './application/handlers/invite-user.handler';
import { AssignRolesHandler } from './application/handlers/assign-roles.handler';

const QueryHandlers = [ListUsersHandler, GetUserHandler, GetMeHandler];
const CommandHandlers = [
  CreateUserHandler,
  UpdateUserHandler,
  DeactivateUserHandler,
  InviteUserHandler,
  AssignRolesHandler,
];

@Module({
  imports: [CqrsModule, AuthModule, AuditModule, IdentityModule],
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UserScopeService,
    ...QueryHandlers,
    ...CommandHandlers,
  ],
  exports: [UsersRepository],
})
export class UsersModule {}
