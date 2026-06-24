import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuthzController } from './presentation/http/authz.controller';
import { RolesRepository } from './infrastructure/persistence/roles.repository';
import { ListRolesHandler } from './application/handlers/list-roles.handler';

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [AuthzController],
  providers: [RolesRepository, ListRolesHandler],
})
export class AuthorizationModule {}
