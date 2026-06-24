import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutCommand } from '../commands/logout.command';
import { RefreshTokenRepository } from '../../infrastructure/persistence/refresh-token.repository';
import { TokenServicePort } from '../ports/token.service.port';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand, void> {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly tokens: TokenServicePort,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    if (command.refreshTokenRaw) {
      const hash = this.tokens.hashToken(command.refreshTokenRaw);
      const stored = await this.refreshTokens.findByTokenHash(hash);
      if (stored && !stored.revokedAt) {
        await this.refreshTokens.revoke(stored.id);
      }
    }

    await this.audit.record({
      actorId: command.userId,
      action: 'AUTH_LOGOUT',
      entityType: 'user',
      entityId: command.userId,
      metadata: {},
    });
  }
}
