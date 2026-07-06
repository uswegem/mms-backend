import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AssignRolesCommand } from '../commands/assign-roles.command';
import { UsersRepository } from '../../infrastructure/persistence/users.repository';
import { UserScopeService } from '../services/user-scope.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { RbacService } from '@infrastructure/auth/rbac/rbac.service';
import { UserNotFoundException, UserValidationException } from '../../domain/exceptions/user.exceptions';
import {
  toUserResponse,
  UserResponseDto,
} from '../mappers/user-response.mapper';

@CommandHandler(AssignRolesCommand)
export class AssignRolesHandler
  implements ICommandHandler<AssignRolesCommand, UserResponseDto>
{
  constructor(
    private readonly users: UsersRepository,
    private readonly scope: UserScopeService,
    private readonly audit: AuditLogService,
    private readonly rbac: RbacService,
  ) {}

  async execute(command: AssignRolesCommand): Promise<UserResponseDto> {
    const existing = await this.users.findById(command.userId);
    if (!existing) throw new UserNotFoundException(command.userId);
    this.scope.assertCanAccessUser(command.actor, existing);

    const roles = await this.users.findRolesByIds(
      command.roleIds,
      command.actor.acquirerId,
    );
    if (roles.length !== command.roleIds.length) {
      throw new UserValidationException('One or more roles are invalid');
    }

    this.scope.assertCanAssignRoles(
      command.actor,
      roles.map((r) => r.code),
      existing.merchantId,
    );

    const scopeType = existing.merchantId ? 'MERCHANT' : 'ACQUIRER';
    const scopeId = existing.merchantId ?? command.actor.acquirerId;

    const user = await this.users.assignRoles(
      command.userId,
      command.roleIds,
      scopeType,
      scopeId,
      command.actor.sub,
    );

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'USER_ROLES_ASSIGNED',
      entityType: 'user',
      entityId: user.id,
      metadata: { roles: roles.map((r) => r.code) },
    });

    await this.rbac.invalidateUser(command.userId);

    return toUserResponse(user);
  }
}
