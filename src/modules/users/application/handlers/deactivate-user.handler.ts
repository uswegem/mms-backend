import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DeactivateUserCommand } from '../commands/deactivate-user.command';
import { UsersRepository } from '../../infrastructure/persistence/users.repository';
import { UserScopeService } from '../services/user-scope.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import {
  UserNotFoundException,
  UserValidationException,
} from '../../domain/exceptions/user.exceptions';
import {
  toUserResponse,
  UserResponseDto,
} from '../mappers/user-response.mapper';

@CommandHandler(DeactivateUserCommand)
export class DeactivateUserHandler
  implements ICommandHandler<DeactivateUserCommand, UserResponseDto>
{
  constructor(
    private readonly users: UsersRepository,
    private readonly scope: UserScopeService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: DeactivateUserCommand): Promise<UserResponseDto> {
    this.scope.requirePermission(command.actor, Permission.USER_DEACTIVATE);

    if (command.userId === command.actor.sub) {
      throw new UserValidationException('You cannot deactivate your own account');
    }

    const existing = await this.users.findById(command.userId);
    if (!existing) throw new UserNotFoundException(command.userId);
    this.scope.assertCanAccessUser(command.actor, existing);

    const user = await this.users.deactivate(command.userId, command.actor.sub);

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'USER_DEACTIVATED',
      entityType: 'user',
      entityId: user.id,
      metadata: {},
    });

    return toUserResponse(user);
  }
}
