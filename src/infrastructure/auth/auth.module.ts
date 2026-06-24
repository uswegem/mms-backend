import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from './jwt/jwt.module';
import { RefreshTokenModule } from './refresh-token/refresh-token.module';
import { RbacModule } from './rbac/rbac.module';
/**
 * Authentication infrastructure (JWT signing, Passport, RBAC).
 * Auth flows live in modules/identity; JwtStrategy registered there.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule,
    RefreshTokenModule,
    RbacModule,
  ],
  exports: [JwtModule, RefreshTokenModule, RbacModule, PassportModule],
})
export class AuthModule {}
