import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { decodeProtectedHeader } from 'jose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnrichedAuthUserService } from '../services/enriched-auth-user.service';
import { UserRepository } from '../persistence/user.repository';
import { JwtKeyCacheService } from '../services/jwt-key-cache.service';

export interface JwtPayload {
  sub: string;
  email: string;
  acquirerId: string;
  merchantId?: string;
  roles: string[];
  permissions: string[];
  storeIds?: string[];
  terminalIds?: string[];
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    keyCache: JwtKeyCacheService,
    private readonly users: UserRepository,
    private readonly enrichedAuth: EnrichedAuthUserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'], // the only algorithm ever accepted — no HS256 fallback (brief §2.6)
      // Vault-issued keys are resolved by version (kid), not a single
      // static secret — see JwtKeyCacheService for the by-version cache
      // that makes rotation (§2.5) work without a Vault call per request.
      secretOrKeyProvider: (
        _req: unknown,
        rawJwtToken: string,
        done: (err: Error | null, key?: string) => void,
      ) => {
        void (async () => {
          try {
            const { kid } = decodeProtectedHeader(rawJwtToken);
            if (!kid) throw new Error('Access token is missing kid');
            const key = await keyCache.getKeyForVersion(Number(kid));
            // passport-jwt's jsonwebtoken verifier accepts a KeyObject via
            // this callback despite the `string` type in its own typings.
            done(null, key as unknown as string);
          } catch (err) {
            done(
              err instanceof Error ? err : new Error('Key resolution failed'),
            );
          }
        })();
      },
    });
  }

  async validate(tokenPayload: JwtPayload): Promise<JwtPayload> {
    if (tokenPayload.type !== 'access') {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(tokenPayload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    const enriched = await this.enrichedAuth.fromDbUser(user);
    return { ...enriched.toJwtPayload(), type: 'access' };
  }
}
