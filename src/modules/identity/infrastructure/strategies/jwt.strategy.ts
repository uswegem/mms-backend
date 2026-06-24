import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRepository } from '../persistence/user.repository';

export interface JwtPayload {
  sub: string;
  email: string;
  acquirerId: string;
  merchantId?: string;
  roles: string[];
  permissions: string[];
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UserRepository,
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

    const userPayload = this.users.toAuthUser(user).toJwtPayload();
    return { ...userPayload, type: 'access' } as JwtPayload;
  }
}
