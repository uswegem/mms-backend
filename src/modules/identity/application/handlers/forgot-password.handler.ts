import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { ForgotPasswordCommand } from '../commands/forgot-password.command';
import { UserRepository } from '../../infrastructure/persistence/user.repository';
import { PasswordResetRepository } from '../../infrastructure/persistence/password-reset.repository';
import { TokenServicePort } from '../ports/token.service.port';
import { Logger } from '@nestjs/common';

export interface ForgotPasswordResult {
  message: string;
  resetToken?: string;
}

@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordHandler
  implements ICommandHandler<ForgotPasswordCommand, ForgotPasswordResult>
{
  private readonly logger = new Logger(ForgotPasswordHandler.name);

  constructor(
    private readonly users: UserRepository,
    private readonly passwordResets: PasswordResetRepository,
    private readonly tokens: TokenServicePort,
    private readonly config: ConfigService,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<ForgotPasswordResult> {
    const message =
      'If an account exists for this email, password reset instructions have been sent.';

    const user = await this.users.findByEmail(command.email);
    if (!user) {
      return { message };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.tokens.hashToken(rawToken);
    const expiryHours =
      this.config.get<number>('auth.passwordResetExpiryHours') ?? 1;
    const expiresAt = new Date(Date.now() + expiryHours * 3_600_000);

    await this.passwordResets.create(user.id, tokenHash, expiresAt);

    if (this.config.get<string>('nodeEnv') === 'development') {
      this.logger.warn(`Password reset token for ${user.email}: ${rawToken}`);
      return { message, resetToken: rawToken };
    }

    // TODO: dispatch email via notifications module
    return { message };
  }
}
