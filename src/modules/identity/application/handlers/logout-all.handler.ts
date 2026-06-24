import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutAllCommand } from '../commands/logout-all.command';
import { RefreshTokenRepository } from '../../infrastructure/persistence/refresh-token.repository';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';

@CommandHandler(LogoutAllCommand)
export class LogoutAllHandler implements ICommandHandler<LogoutAllCommand, void> {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: LogoutAllCommand): Promise<void> {
    await this.refreshTokens.revokeAllForUser(command.userId);
    await this.audit.record({
      actorId: command.userId,
      action: 'AUTH_LOGOUT_ALL',
      entityType: 'user',
      entityId: command.userId,
      metadata: {},
    });
  }
}
