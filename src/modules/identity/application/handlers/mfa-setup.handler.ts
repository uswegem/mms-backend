import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { MfaSetupCommand } from '../commands/mfa-setup.command';
import { UserRepository } from '../../infrastructure/persistence/user.repository';
import { AuthCredentialRepository } from '../../infrastructure/persistence/auth-credential.repository';
import { MfaServicePort } from '../ports/mfa.service.port';
import { AppException } from '@shared/infrastructure/exceptions/app.exception';
import { ErrorCodes } from '@shared/infrastructure/exceptions/error-codes';
import { HttpStatus } from '@nestjs/common';

export interface MfaSetupResult {
  secret: string;
  qrUrl: string;
}

@CommandHandler(MfaSetupCommand)
export class MfaSetupHandler
  implements ICommandHandler<MfaSetupCommand, MfaSetupResult>
{
  constructor(
    private readonly users: UserRepository,
    private readonly credentials: AuthCredentialRepository,
    private readonly mfa: MfaServicePort,
  ) {}

  async execute(command: MfaSetupCommand): Promise<MfaSetupResult> {
    const user = await this.users.findById(command.userId);
    if (!user) {
      throw new AppException(
        ErrorCodes.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'User not found',
      );
    }

    const setup = await this.mfa.generateSetup(user.email);
    const encrypted = this.mfa.encryptSecret(setup.secret);
    await this.credentials.saveMfaSecret(user.id, encrypted, false);

    return {
      secret: setup.secret,
      qrUrl: setup.qrCodeDataUrl,
    };
  }
}
