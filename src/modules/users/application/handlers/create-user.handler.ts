import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { CreateUserCommand } from '../commands/create-user.command';
import { UsersRepository } from '../../infrastructure/persistence/users.repository';
import { UserScopeService } from '../services/user-scope.service';
import { PasswordHasherPort } from '@modules/identity/application/ports/password-hasher.port';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import {
  UserConflictException,
  UserValidationException,
} from '../../domain/exceptions/user.exceptions';
import {
  toUserResponse,
  UserResponseDto,
} from '../mappers/user-response.mapper';

export interface CreateUserResult {
  user: UserResponseDto;
  temporaryPassword?: string;
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler
  implements ICommandHandler<CreateUserCommand, CreateUserResult>
{
  constructor(
    private readonly users: UsersRepository,
    private readonly scope: UserScopeService,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  async execute(command: CreateUserCommand): Promise<CreateUserResult> {
    this.scope.requirePermission(command.actor, Permission.USER_WRITE);

    const existing = await this.users.findByEmail(
      command.actor.acquirerId,
      command.email,
    );
    if (existing) {
      throw new UserConflictException('A user with this email already exists');
    }

    const roles = await this.users.findRolesByIds(
      command.roleIds,
      command.actor.acquirerId,
    );
    if (roles.length !== command.roleIds.length) {
      throw new UserValidationException('One or more roles are invalid');
    }

    const scope = this.scope.resolveScopeForCreate(
      command.actor,
      command.merchantId,
    );
    this.scope.assertCanAssignRoles(
      command.actor,
      roles.map((r) => r.code),
      scope.merchantId,
    );

    const tempPassword = randomBytes(12).toString('base64url').slice(0, 16);
    const passwordHash = await this.passwordHasher.hash(tempPassword);

    const user = await this.users.create({
      acquirerId: command.actor.acquirerId,
      email: command.email,
      fullName: command.fullName,
      merchantId: scope.merchantId,
      status: 'ACTIVE',
      createdBy: command.actor.sub,
      roleIds: command.roleIds,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      passwordHash,
      phone: command.phone,
    });

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email, roles: roles.map((r) => r.code) },
    });

    return {
      user: toUserResponse(user),
      temporaryPassword:
        this.config.get<string>('nodeEnv') === 'development'
          ? tempPassword
          : undefined,
    };
  }
}
