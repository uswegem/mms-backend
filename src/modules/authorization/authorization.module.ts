import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { AuthzController } from './presentation/http/authz.controller';
import { RolesRepository } from './infrastructure/persistence/roles.repository';
import { PermissionsRepository } from './infrastructure/persistence/permissions.repository';
import { PolicyOverridesRepository } from './infrastructure/persistence/policy-overrides.repository';
import { AuthzAuditService } from './application/services/authz-audit.service';
import {
  AssignRolePermissionsHandler,
  CreatePolicyOverrideHandler,
  CreateRoleHandler,
  DeleteRoleHandler,
  GetEffectivePermissionsHandler,
  GetMyPermissionsHandler,
  GetRoleDetailHandler,
  ListPermissionsHandler,
  ListPolicyOverridesHandler,
  ListRolesHandler,
  RevokePolicyOverrideHandler,
  UpdateRoleHandler,
} from './application/handlers/authz.handlers';

const Handlers = [
  ListRolesHandler,
  GetRoleDetailHandler,
  ListPermissionsHandler,
  GetMyPermissionsHandler,
  GetEffectivePermissionsHandler,
  ListPolicyOverridesHandler,
  CreateRoleHandler,
  UpdateRoleHandler,
  DeleteRoleHandler,
  AssignRolePermissionsHandler,
  CreatePolicyOverrideHandler,
  RevokePolicyOverrideHandler,
];

@Module({
  imports: [CqrsModule, AuthModule, AuditModule],
  controllers: [AuthzController],
  providers: [
    RolesRepository,
    PermissionsRepository,
    PolicyOverridesRepository,
    AuthzAuditService,
    ...Handlers,
  ],
  exports: [RolesRepository, AuthzAuditService],
})
export class AuthorizationModule {}
