import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { MfaVerifyCommand } from '../commands/mfa-verify.command';
import { UserRepository } from '../../infrastructure/persistence/user.repository';
import { AuthCredentialRepository } from '../../infrastructure/persistence/auth-credential.repository';
import { MfaServicePort } from '../ports/mfa.service.port';
import {
  InvalidCredentialsException,
  InvalidMfaCodeException,
} from '../../domain/exceptions/auth.exceptions';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';

@CommandHandler(MfaVerifyCommand)
export class MfaVerifyHandler
  implements ICommandHandler<MfaVerifyCommand, { verified: boolean }>
{
  constructor(
    private readonly users: UserRepository,
    private readonly credentials: AuthCredentialRepository,
    private readonly mfa: MfaServicePort,
    private readonly audit: AuditLogService,
  ) {}

  async execute(
    command: MfaVerifyCommand,
  ): Promise<{ verified: boolean }> {
    const user = await this.users.findByEmail(command.email);
    if (!user?.authCredential?.mfaSecretEnc) {
      throw new InvalidCredentialsException();
    }

    const secret = this.mfa.decryptSecret(
      Buffer.from(user.authCredential.mfaSecretEnc),
    );

    if (!this.mfa.verifyCode(secret, command.mfaCode)) {
      throw new InvalidMfaCodeException();
    }

    await this.credentials.enableMfa(user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'AUTH_MFA_ENABLED',
      entityType: 'user',
      entityId: user.id,
      metadata: {},
    });

    return { verified: true };
  }
}
