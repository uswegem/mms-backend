import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { LoginCommand } from '../commands/login.command';
import { UserRepository } from '../../infrastructure/persistence/user.repository';
import { AuthCredentialRepository } from '../../infrastructure/persistence/auth-credential.repository';
import { LoginAttemptRepository } from '../../infrastructure/persistence/login-attempt.repository';
import { PasswordHasherPort } from '../ports/password-hasher.port';
import { TokenServicePort } from '../ports/token.service.port';
import { MfaServicePort } from '../ports/mfa.service.port';
import {
  AccountLockedException,
  InvalidCredentialsException,
  InvalidMfaCodeException,
  MfaRequiredException,
  UserNotActiveException,
} from '../../domain/exceptions/auth.exceptions';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { EnrichedAuthUserService } from '../../infrastructure/services/enriched-auth-user.service';

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  refreshToken: string;
  refreshExpiresAt: Date;
}

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, LoginResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly credentials: AuthCredentialRepository,
    private readonly loginAttempts: LoginAttemptRepository,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokens: TokenServicePort,
    private readonly mfa: MfaServicePort,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
    private readonly enrichedAuth: EnrichedAuthUserService,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const user = await this.users.findByEmail(command.email);

    if (!user?.authCredential) {
      await this.loginAttempts.record(
        command.email,
        false,
        command.ipAddress,
        command.userAgent,
      );
      throw new InvalidCredentialsException();
    }

    const cred = user.authCredential;

    if (
      user.status === UserStatus.LOCKED ||
      (cred.lockoutUntil && cred.lockoutUntil > new Date())
    ) {
      throw new AccountLockedException(cred.lockoutUntil ?? undefined);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UserNotActiveException();
    }

    const passwordValid = await this.passwordHasher.verify(
      command.password,
      cred.passwordHash,
    );

    if (!passwordValid) {
      const maxAttempts = this.config.get<number>('auth.maxFailedAttempts') ?? 5;
      const lockoutMinutes =
        this.config.get<number>('auth.lockoutDurationMinutes') ?? 15;
      await this.credentials.recordFailedAttempt(
        user.id,
        maxAttempts,
        lockoutMinutes,
      );
      await this.loginAttempts.record(
        command.email,
        false,
        command.ipAddress,
        command.userAgent,
      );
      throw new InvalidCredentialsException();
    }

    if (cred.mfaEnabled) {
      if (!command.mfaCode) {
        throw new MfaRequiredException();
      }
      if (!cred.mfaSecretEnc) {
        throw new InvalidMfaCodeException();
      }
      const secret = this.mfa.decryptSecret(Buffer.from(cred.mfaSecretEnc));
      if (!this.mfa.verifyCode(secret, command.mfaCode)) {
        await this.loginAttempts.record(
          command.email,
          false,
          command.ipAddress,
          command.userAgent,
        );
        throw new InvalidMfaCodeException();
      }
    }

    await this.credentials.resetFailedAttempts(user.id);
    await this.users.updateLastLogin(user.id);
    await this.loginAttempts.record(
      command.email,
      true,
      command.ipAddress,
      command.userAgent,
    );

    const authUser = await this.enrichedAuth.fromDbUser(user);
    const tokenPair = await this.tokens.issueTokens(
      authUser,
      undefined,
      command.ipAddress,
    );

    await this.audit.record({
      actorId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
    });

    return {
      accessToken: tokenPair.accessToken,
      expiresIn: tokenPair.expiresIn,
      tokenType: tokenPair.tokenType,
      refreshToken: tokenPair.refreshToken,
      refreshExpiresAt: tokenPair.refreshExpiresAt,
    };
  }
}
