import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { AuthUser } from '../../domain/entities/auth-user.entity';
import {
  TokenPair,
  TokenServicePort,
} from '../../application/ports/token.service.port';
import { RefreshTokenRepository } from '../persistence/refresh-token.repository';

@Injectable()
export class JwtTokenService extends TokenServicePort {
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {
    super();
    this.accessExpiresIn = config.getOrThrow<string>('jwt.accessExpiresIn');
    this.refreshExpiresMs = ms(
      config.getOrThrow<string>('jwt.refreshExpiresIn') as StringValue,
    );
  }

  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async issueTokens(
    user: AuthUser,
    familyId?: string,
    clientIp?: string,
  ): Promise<TokenPair> {
    const refreshToken = randomBytes(48).toString('base64url');
    const tokenFamilyId = familyId ?? randomUUID();
    const refreshExpiresAt = new Date(Date.now() + this.refreshExpiresMs);

    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      familyId: tokenFamilyId,
      expiresAt: refreshExpiresAt,
      createdIp: clientIp,
    });

    const accessToken = await this.jwt.signAsync({
      ...user.toJwtPayload(),
      type: 'access',
    });

    const expiresInMs = ms(this.accessExpiresIn as StringValue);
    return {
      accessToken,
      expiresIn: Math.floor(expiresInMs / 1000),
      tokenType: 'Bearer',
      refreshToken,
      refreshExpiresAt,
      familyId: tokenFamilyId,
    };
  }

  async verifyAccessToken(token: string): Promise<Record<string, unknown>> {
    return this.jwt.verifyAsync(token);
  }
}
