import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RbacService } from '@infrastructure/auth/rbac/rbac.service';
import { EnrichedAuthUserService } from '../services/enriched-auth-user.service';
import { UserRepository } from '../persistence/user.repository';

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
    config: ConfigService,
    private readonly users: UserRepository,
    private readonly enrichedAuth: EnrichedAuthUserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
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
    return { ...enriched.toJwtPayload(), type: 'access' } as JwtPayload;
  }
}
