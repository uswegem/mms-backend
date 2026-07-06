import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { AuthController } from './presentation/http/auth.controller';
import { UserRepository } from './infrastructure/persistence/user.repository';
import { AuthCredentialRepository } from './infrastructure/persistence/auth-credential.repository';
import { RefreshTokenRepository } from './infrastructure/persistence/refresh-token.repository';
import { PasswordResetRepository } from './infrastructure/persistence/password-reset.repository';
import { LoginAttemptRepository } from './infrastructure/persistence/login-attempt.repository';
import { BcryptPasswordHasherService } from './infrastructure/services/bcrypt-password-hasher.service';
import { TotpMfaService } from './infrastructure/services/totp-mfa.service';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { EnrichedAuthUserService } from './infrastructure/services/enriched-auth-user.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { PasswordHasherPort } from './application/ports/password-hasher.port';
import { TokenServicePort } from './application/ports/token.service.port';
import { MfaServicePort } from './application/ports/mfa.service.port';
import { LoginHandler } from './application/handlers/login.handler';
import { RefreshTokenHandler } from './application/handlers/refresh-token.handler';
import { LogoutHandler } from './application/handlers/logout.handler';
import { LogoutAllHandler } from './application/handlers/logout-all.handler';
import { ForgotPasswordHandler } from './application/handlers/forgot-password.handler';
import { ResetPasswordHandler } from './application/handlers/reset-password.handler';
import { MfaSetupHandler } from './application/handlers/mfa-setup.handler';
import { MfaVerifyHandler } from './application/handlers/mfa-verify.handler';

const CommandHandlers = [
  LoginHandler,
  RefreshTokenHandler,
  LogoutHandler,
  LogoutAllHandler,
  ForgotPasswordHandler,
  ResetPasswordHandler,
  MfaSetupHandler,
  MfaVerifyHandler,
];

@Module({
  imports: [CqrsModule, AuthModule, AuditModule],
  controllers: [AuthController],
  providers: [
    UserRepository,
    AuthCredentialRepository,
    RefreshTokenRepository,
    PasswordResetRepository,
    LoginAttemptRepository,
    EnrichedAuthUserService,
    JwtStrategy,
    { provide: PasswordHasherPort, useClass: BcryptPasswordHasherService },
    { provide: TokenServicePort, useClass: JwtTokenService },
    { provide: MfaServicePort, useClass: TotpMfaService },
    ...CommandHandlers,
  ],
  exports: [UserRepository, PasswordHasherPort],
})
export class IdentityModule {}
