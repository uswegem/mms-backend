import { CommandHandler, ICommandHandler, QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { RbacService } from '@infrastructure/auth/rbac/rbac.service';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { RolesRepository } from '../../infrastructure/persistence/roles.repository';
import { PermissionsRepository } from '../../infrastructure/persistence/permissions.repository';
import { PolicyOverridesRepository } from '../../infrastructure/persistence/policy-overrides.repository';
import { AuthzAuditService } from '../services/authz-audit.service';
import { RoleDetailDto, RoleListItemDto } from '../../presentation/dto/role.dto';
import { EffectivePermissionsDto } from '../../presentation/dto/permission.dto';

// Queries
export class ListRolesQuery {
  constructor(public readonly acquirerId: string) {}
}

export class GetRoleDetailQuery {
  constructor(
    public readonly acquirerId: string,
    public readonly roleId: string,
  ) {}
}

export class ListPermissionsQuery {}

export class GetMyPermissionsQuery {
  constructor(public readonly userId: string) {}
}

export class GetEffectivePermissionsQuery {
  constructor(public readonly userId: string) {}
}

export class ListPolicyOverridesQuery {
  constructor(
    public readonly acquirerId: string,
    public readonly userId?: string,
  ) {}
}

// Commands
export class CreateRoleCommand {
  constructor(
    public readonly actor: JwtPayload,
    public readonly code: string,
    public readonly name: string,
  ) {}
}

export class UpdateRoleCommand {
  constructor(
    public readonly actor: JwtPayload,
    public readonly roleId: string,
    public readonly name?: string,
  ) {}
}

export class DeleteRoleCommand {
  constructor(
    public readonly actor: JwtPayload,
    public readonly roleId: string,
  ) {}
}

export class AssignRolePermissionsCommand {
  constructor(
    public readonly actor: JwtPayload,
    public readonly roleId: string,
    public readonly permissionCodes: string[],
  ) {}
}

export class CreatePolicyOverrideCommand {
  constructor(
    public readonly actor: JwtPayload,
    public readonly body: {
      userId: string;
      permissionCode: string;
      effect: 'ALLOW' | 'DENY';
      scopeType?: string;
      scopeId?: string;
      reason?: string;
      expiresAt?: string;
    },
  ) {}
}

export class RevokePolicyOverrideCommand {
  constructor(
    public readonly actor: JwtPayload,
    public readonly overrideId: string,
  ) {}
}

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery> {
  constructor(private readonly roles: RolesRepository) {}

  execute(query: ListRolesQuery): Promise<RoleListItemDto[]> {
    return this.roles.findAll(query.acquirerId);
  }
}

@QueryHandler(GetRoleDetailQuery)
export class GetRoleDetailHandler implements IQueryHandler<GetRoleDetailQuery> {
  constructor(private readonly roles: RolesRepository) {}

  async execute(query: GetRoleDetailQuery): Promise<RoleDetailDto> {
    const role = await this.roles.findById(query.acquirerId, query.roleId);
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions.map((rp) => rp.permission.code),
      assignedUserCount: role._count.userRoles,
    };
  }
}

@QueryHandler(ListPermissionsQuery)
export class ListPermissionsHandler implements IQueryHandler<ListPermissionsQuery> {
  constructor(private readonly permissions: PermissionsRepository) {}

  execute() {
    return this.permissions.findAll();
  }
}

@QueryHandler(GetMyPermissionsQuery)
export class GetMyPermissionsHandler
  implements IQueryHandler<GetMyPermissionsQuery, EffectivePermissionsDto>
{
  constructor(private readonly rbac: RbacService) {}

  execute(query: GetMyPermissionsQuery) {
    return this.rbac.getEffectivePermissions(query.userId);
  }
}

@QueryHandler(GetEffectivePermissionsQuery)
export class GetEffectivePermissionsHandler
  implements IQueryHandler<GetEffectivePermissionsQuery, EffectivePermissionsDto>
{
  constructor(private readonly rbac: RbacService) {}

  execute(query: GetEffectivePermissionsQuery) {
    return this.rbac.getEffectivePermissions(query.userId);
  }
}

@QueryHandler(ListPolicyOverridesQuery)
export class ListPolicyOverridesHandler implements IQueryHandler<ListPolicyOverridesQuery> {
  constructor(private readonly overrides: PolicyOverridesRepository) {}

  execute(query: ListPolicyOverridesQuery) {
    return this.overrides.findActive(query.acquirerId, query.userId);
  }
}

@CommandHandler(CreateRoleCommand)
export class CreateRoleHandler implements ICommandHandler<CreateRoleCommand> {
  constructor(
    private readonly roles: RolesRepository,
    private readonly audit: AuthzAuditService,
  ) {}

  async execute(command: CreateRoleCommand) {
    const role = await this.roles.create(
      command.actor.acquirerId,
      { code: command.code, name: command.name },
      command.actor.sub,
    );
    await this.audit.recordRoleChange(command.actor.sub, 'AUTHZ_ROLE_CREATED', role.id, {
      code: role.code,
      name: role.name,
    });
    return role;
  }
}

@CommandHandler(UpdateRoleCommand)
export class UpdateRoleHandler implements ICommandHandler<UpdateRoleCommand> {
  constructor(
    private readonly roles: RolesRepository,
    private readonly audit: AuthzAuditService,
  ) {}

  async execute(command: UpdateRoleCommand) {
    const role = await this.roles.update(
      command.actor.acquirerId,
      command.roleId,
      { name: command.name },
      command.actor.sub,
    );
    await this.audit.recordRoleChange(command.actor.sub, 'AUTHZ_ROLE_UPDATED', role.id, {
      name: command.name,
    });
    return role;
  }
}

@CommandHandler(DeleteRoleCommand)
export class DeleteRoleHandler implements ICommandHandler<DeleteRoleCommand> {
  constructor(
    private readonly roles: RolesRepository,
    private readonly audit: AuthzAuditService,
  ) {}

  async execute(command: DeleteRoleCommand) {
    const role = await this.roles.softDelete(
      command.actor.acquirerId,
      command.roleId,
      command.actor.sub,
    );
    await this.audit.recordRoleChange(command.actor.sub, 'AUTHZ_ROLE_DELETED', role.id, {
      code: role.code,
    });
    return role;
  }
}

@CommandHandler(AssignRolePermissionsCommand)
export class AssignRolePermissionsHandler
  implements ICommandHandler<AssignRolePermissionsCommand>
{
  constructor(
    private readonly roles: RolesRepository,
    private readonly rbac: RbacService,
    private readonly audit: AuthzAuditService,
  ) {}

  async execute(command: AssignRolePermissionsCommand) {
    const role = await this.roles.setPermissions(
      command.actor.acquirerId,
      command.roleId,
      command.permissionCodes,
    );
    await this.rbac.invalidateRole(command.roleId);
    await this.audit.recordRoleChange(
      command.actor.sub,
      'AUTHZ_ROLE_PERMISSIONS_UPDATED',
      command.roleId,
      { permissionCodes: command.permissionCodes },
    );
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      permissions: role.permissions.map((rp) => rp.permission.code),
      assignedUserCount: role._count.userRoles,
    };
  }
}

@CommandHandler(CreatePolicyOverrideCommand)
export class CreatePolicyOverrideHandler
  implements ICommandHandler<CreatePolicyOverrideCommand>
{
  constructor(
    private readonly overrides: PolicyOverridesRepository,
    private readonly rbac: RbacService,
    private readonly audit: AuthzAuditService,
  ) {}

  async execute(command: CreatePolicyOverrideCommand) {
    const row = await this.overrides.create(
      command.actor.acquirerId,
      {
        ...command.body,
        expiresAt: command.body.expiresAt
          ? new Date(command.body.expiresAt)
          : undefined,
      },
      command.actor.sub,
    );
    await this.rbac.invalidateUser(command.body.userId);
    await this.audit.recordPolicyOverrideChange(
      command.actor.sub,
      'AUTHZ_POLICY_OVERRIDE_CREATED',
      row.id,
      {
        userId: row.userId,
        permissionCode: row.permissionCode,
        effect: row.effect,
      },
    );
    return row;
  }
}

@CommandHandler(RevokePolicyOverrideCommand)
export class RevokePolicyOverrideHandler
  implements ICommandHandler<RevokePolicyOverrideCommand>
{
  constructor(
    private readonly overrides: PolicyOverridesRepository,
    private readonly rbac: RbacService,
    private readonly audit: AuthzAuditService,
  ) {}

  async execute(command: RevokePolicyOverrideCommand) {
    const row = await this.overrides.revoke(
      command.actor.acquirerId,
      command.overrideId,
      command.actor.sub,
    );
    await this.rbac.invalidateUser(row.userId);
    await this.audit.recordPolicyOverrideChange(
      command.actor.sub,
      'AUTHZ_POLICY_OVERRIDE_REVOKED',
      row.id,
      { userId: row.userId, permissionCode: row.permissionCode },
    );
    return row;
  }
}
