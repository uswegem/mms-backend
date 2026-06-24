import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateUserCommand } from '../commands/update-user.command';
import { UsersRepository } from '../../infrastructure/persistence/users.repository';
import { UserScopeService } from '../services/user-scope.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { UserNotFoundException } from '../../domain/exceptions/user.exceptions';
import {
  toUserResponse,
  UserResponseDto,
} from '../mappers/user-response.mapper';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler
  implements ICommandHandler<UpdateUserCommand, UserResponseDto>
{
  constructor(
    private readonly users: UsersRepository,
    private readonly scope: UserScopeService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: UpdateUserCommand): Promise<UserResponseDto> {
    this.scope.requirePermission(command.actor, Permission.USER_WRITE);

    const existing = await this.users.findById(command.userId);
    if (!existing) throw new UserNotFoundException(command.userId);
    this.scope.assertCanAccessUser(command.actor, existing);

    const user = await this.users.update(command.userId, {
      fullName: command.fullName,
      phone: command.phone,
      updatedBy: command.actor.sub,
    });

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: user.id,
      metadata: {},
    });

    return toUserResponse(user);
  }
}
