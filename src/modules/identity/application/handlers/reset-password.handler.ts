import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ResetPasswordCommand } from '../commands/reset-password.command';
import { PasswordResetRepository } from '../../infrastructure/persistence/password-reset.repository';
import { AuthCredentialRepository } from '../../infrastructure/persistence/auth-credential.repository';
import { RefreshTokenRepository } from '../../infrastructure/persistence/refresh-token.repository';
import { PasswordHasherPort } from '../ports/password-hasher.port';
import { TokenServicePort } from '../ports/token.service.port';
import { InvalidResetTokenException } from '../../domain/exceptions/auth.exceptions';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler
  implements ICommandHandler<ResetPasswordCommand, void>
{
  constructor(
    private readonly passwordResets: PasswordResetRepository,
    private readonly credentials: AuthCredentialRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokens: TokenServicePort,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    const tokenHash = this.tokens.hashToken(command.token);
    const resetRecord = await this.passwordResets.findValidByHash(tokenHash);

    if (!resetRecord) {
      throw new InvalidResetTokenException();
    }

    const passwordHash = await this.passwordHasher.hash(command.newPassword);
    await this.credentials.updatePassword(resetRecord.userId, passwordHash);
    await this.passwordResets.markUsed(resetRecord.id);
    await this.refreshTokens.revokeAllForUser(resetRecord.userId);

    await this.audit.record({
      actorId: resetRecord.userId,
      action: 'AUTH_PASSWORD_RESET',
      entityType: 'user',
      entityId: resetRecord.userId,
      metadata: {},
    });
  }
}
