import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { RefreshTokenModule } from './refresh-token/refresh-token.module';
import { RbacModule } from './rbac/rbac.module';
/**
 * Authentication infrastructure (Passport, RBAC). JWT signing/verification
 * is RS256 via Vault Transit (auth migration brief §2) — provided directly
 * in modules/identity (JwtTokenService, JwtKeyCacheService, JwtStrategy)
 * rather than a shared @nestjs/jwt registration here; there's no longer a
 * shared secret to centralize.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    RefreshTokenModule,
    RbacModule,
  ],
  exports: [RefreshTokenModule, RbacModule, PassportModule],
})
export class AuthModule {}
