import { AuthUser } from '../../domain/entities/auth-user.entity';

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  refreshToken: string;
  refreshExpiresAt: Date;
  familyId: string;
}

export abstract class TokenServicePort {
  abstract issueTokens(
    user: AuthUser,
    familyId?: string,
    clientIp?: string,
  ): Promise<TokenPair>;
  abstract verifyAccessToken(token: string): Promise<Record<string, unknown>>;
  abstract hashToken(raw: string): string;
}
