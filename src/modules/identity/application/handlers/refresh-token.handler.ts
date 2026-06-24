import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokenCommand } from '../commands/refresh-token.command';
import { RefreshTokenRepository } from '../../infrastructure/persistence/refresh-token.repository';
import { UserRepository } from '../../infrastructure/persistence/user.repository';
import { TokenServicePort } from '../ports/token.service.port';
import { InvalidRefreshTokenException } from '../../domain/exceptions/auth.exceptions';

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  refreshToken: string;
  refreshExpiresAt: Date;
}

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler
  implements ICommandHandler<RefreshTokenCommand, RefreshResult>
{
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly tokens: TokenServicePort,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<RefreshResult> {
    const tokenHash = this.tokens.hashToken(command.refreshTokenRaw);
    const stored = await this.refreshTokens.findByTokenHash(tokenHash);

    if (!stored) {
      throw new InvalidRefreshTokenException();
    }

    if (stored.revokedAt) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new InvalidRefreshTokenException();
    }

    if (stored.expiresAt < new Date()) {
      throw new InvalidRefreshTokenException();
    }

    const user = await this.users.findById(stored.userId);
    if (!user) {
      throw new InvalidRefreshTokenException();
    }

    const authUser = this.users.toAuthUser(user);
    const tokenPair = await this.tokens.issueTokens(
      authUser,
      stored.familyId,
      command.ipAddress,
    );

    await this.refreshTokens.revoke(stored.id, tokenPair.familyId);

    return {
      accessToken: tokenPair.accessToken,
      expiresIn: tokenPair.expiresIn,
      tokenType: tokenPair.tokenType,
      refreshToken: tokenPair.refreshToken,
      refreshExpiresAt: tokenPair.refreshExpiresAt,
    };
  }
}
