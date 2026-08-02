import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { InviteUserCommand } from '../commands/invite-user.command';
import { UsersRepository } from '../../infrastructure/persistence/users.repository';
import { UserScopeService } from '../services/user-scope.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import {
  UserConflictException,
  UserValidationException,
} from '../../domain/exceptions/user.exceptions';

export interface InviteUserResult {
  message: string;
  inviteToken?: string;
}

@CommandHandler(InviteUserCommand)
export class InviteUserHandler
  implements ICommandHandler<InviteUserCommand, InviteUserResult>
{
  constructor(
    private readonly users: UsersRepository,
    private readonly scope: UserScopeService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  async execute(command: InviteUserCommand): Promise<InviteUserResult> {
    this.scope.requirePermission(command.actor, Permission.USER_INVITE);

    const role = await this.users.findRoleById(
      command.roleId,
      command.actor.acquirerId,
    );
    if (!role) throw new UserValidationException('Invalid role');

    const scope = this.scope.resolveScopeForCreate(
      command.actor,
      command.merchantId,
    );
    this.scope.assertCanAssignRoles(command.actor, [role.code], scope.merchantId);

    const existing = await this.users.findByEmailIncludingDeleted(
      command.actor.acquirerId,
      command.email,
    );
    if (existing && !existing.deletedAt) {
      throw new UserConflictException('A user with this email already exists');
    }
    if (existing?.deletedAt) {
      throw new UserConflictException(
        'A deactivated user with this email already exists. Create the user again from Users to reactivate them.',
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(
      Date.now() +
        (this.config.get<number>('auth.inviteExpiryHours') ?? 72) * 3_600_000,
    );

    await this.users.createInvitation({
      acquirerId: command.actor.acquirerId,
      email: command.email,
      roleId: command.roleId,
      tokenHash,
      expiresAt,
      invitedBy: command.actor.sub,
    });

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'USER_INVITED',
      entityType: 'user_invitation',
      entityId: null,
      metadata: { email: command.email, role: role.code },
    });

    const message = 'Invitation sent if the email address is valid.';
    return {
      message,
      inviteToken:
        this.config.get<string>('nodeEnv') === 'development'
          ? rawToken
          : undefined,
    };
  }
}
