import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

export class AuthCookieHelper {
  static setRefreshCookie(
    res: Response,
    config: ConfigService,
    refreshToken: string,
    expiresAt: Date,
  ): void {
    const cookieName = config.get<string>('auth.refreshCookieName') ?? 'refreshToken';
    const isProd = config.get<string>('nodeEnv') === 'production';

    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      expires: expiresAt,
      path: '/api/v1/auth',
    });
  }

  static clearRefreshCookie(res: Response, config: ConfigService): void {
    const cookieName = config.get<string>('auth.refreshCookieName') ?? 'refreshToken';
    res.clearCookie(cookieName, { path: '/api/v1/auth' });
  }

  static getRefreshTokenFromCookie(
    cookies: Record<string, string> | undefined,
    config: ConfigService,
  ): string | undefined {
    const cookieName = config.get<string>('auth.refreshCookieName') ?? 'refreshToken';
    return cookies?.[cookieName];
  }
}
