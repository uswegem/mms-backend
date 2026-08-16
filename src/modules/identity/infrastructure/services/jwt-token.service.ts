import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import { createHash, randomBytes, randomUUID } from 'crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { VaultTransitClient } from '@infrastructure/vault/vault-transit.client';
import { AuthUser } from '../../domain/entities/auth-user.entity';
import {
  TokenPair,
  TokenServicePort,
} from '../../application/ports/token.service.port';
import { RefreshTokenRepository } from '../persistence/refresh-token.repository';
import { JwtKeyCacheService } from './jwt-key-cache.service';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Access tokens are RS256, signed by Vault Transit — the private key never
 * enters this process (brief §2.1/§2.3). No dual-algorithm support: this is
 * the only signing/verification path, there is no HS256 fallback anywhere
 * in it (§2.6).
 *
 * Refresh tokens are unaffected by this migration — they're opaque random
 * bytes tracked in Postgres (see RefreshTokenRepository), not JWTs, so
 * there's no "old refresh tokens signed under the old scheme" problem to
 * solve at cutover the way the brief's §2.6 anticipates for JWT-based
 * refresh tokens. The real cutover effect is simpler here: every currently
 *-issued access token (max 15 min old) stops verifying the moment this
 * ships, and the very next /auth/refresh call — which already re-signs a
 * fresh access token unconditionally — issues a valid RS256 one. No forced
 * logout, no explicit session-store invalidation needed.
 */
@Injectable()
export class JwtTokenService extends TokenServicePort {
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresMs: number;

  constructor(
    private readonly vault: VaultTransitClient,
    private readonly keyCache: JwtKeyCacheService,
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

    const expiresInMs = ms(this.accessExpiresIn as StringValue);
    const accessToken = await this.signAccessToken(
      { ...user.toJwtPayload(), type: 'access' },
      Math.floor(expiresInMs / 1000),
    );

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
    try {
      const { payload } = await jwtVerify(
        token,
        async (protectedHeader) => {
          const kid = protectedHeader.kid;
          if (!kid) throw new Error('Access token is missing kid');
          return this.keyCache.getKeyForVersion(Number(kid));
        },
        { algorithms: ['RS256'] }, // no downgrade path — this is the only algorithm ever accepted
      );
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  /**
   * Builds and Vault-signs a compact RS256 JWT, retrying once if the key
   * version used to sign doesn't match the version named in `kid` — this
   * only happens if a rotation (brief §2.5) lands in the few-millisecond
   * window between reading the latest version and Vault actually signing.
   * Rotation is a rare, deliberate Phase 2+ operation, so this race is
   * accepted and self-corrects rather than needing a Vault API guarantee
   * that doesn't exist (Transit's sign endpoint always uses whatever is
   * current — there's no "sign with version N" request parameter).
   */
  private async signAccessToken(
    payload: Record<string, unknown>,
    expiresInSeconds: number,
    isRetry = false,
  ): Promise<string> {
    const version = await this.keyCache.getLatestVersion();
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT', kid: String(version) };
    const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(fullPayload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const { signature, keyVersion } = await this.vault.sign(signingInput);

    if (keyVersion !== version) {
      if (isRetry) {
        throw new Error(
          `Vault signed with key version ${keyVersion} but expected ${version} on retry — aborting`,
        );
      }
      this.keyCache.invalidate();
      return this.signAccessToken(payload, expiresInSeconds, true);
    }

    // Vault returns standard base64; JWS signatures are base64url.
    const encodedSignature = base64url(Buffer.from(signature, 'base64'));
    return `${signingInput}.${encodedSignature}`;
  }
}
