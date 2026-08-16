import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '@infrastructure/auth/rbac/decorators/public.decorator';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '../../infrastructure/strategies/jwt.strategy';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { InvalidRefreshTokenException } from '../../domain/exceptions/auth.exceptions';
import { LoginCommand } from '../../application/commands/login.command';
import { LogoutCommand } from '../../application/commands/logout.command';
import { LogoutAllCommand } from '../../application/commands/logout-all.command';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { ForgotPasswordCommand } from '../../application/commands/forgot-password.command';
import { ResetPasswordCommand } from '../../application/commands/reset-password.command';
import { MfaSetupCommand } from '../../application/commands/mfa-setup.command';
import { MfaVerifyCommand } from '../../application/commands/mfa-verify.command';
import { LoginDto, TokenResponseDto } from '../dto/login.dto';
import {
  ForgotPasswordDto,
  ForgotPasswordResponseDto,
} from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import {
  MfaSetupResponseDto,
  MfaVerifyDto,
  MfaVerifyResponseDto,
} from '../dto/mfa.dto';
import { AuthCookieHelper } from './auth-cookie.helper';

// Tighter than the global default (see infrastructure/throttler) — brief §5
// calls for rate limiting specifically on auth endpoints to blunt
// credential-stuffing / brute-force. Keep in sync with THROTTLE_AUTH_LIMIT /
// THROTTLE_TTL_MS in .env.example; decorator values can't read ConfigService
// at request time, so this is a static mirror of that default, not itself
// env-driven.
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.commandBus.execute(
      new LoginCommand(
        dto.email,
        dto.password,
        dto.mfaCode,
        req.ip,
        req.headers['user-agent'],
      ),
    );

    AuthCookieHelper.setRefreshCookie(
      res,
      this.config,
      result.refreshToken,
      result.refreshExpiresAt,
    );

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: result.tokenType,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using httpOnly cookie' })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const refreshToken = AuthCookieHelper.getRefreshTokenFromCookie(
      req.cookies,
      this.config,
    );
    if (!refreshToken) {
      throw new InvalidRefreshTokenException();
    }

    const result = await this.commandBus.execute(
      new RefreshTokenCommand(refreshToken, req.ip),
    );

    AuthCookieHelper.setRefreshCookie(
      res,
      this.config,
      result.refreshToken,
      result.refreshExpiresAt,
    );

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: result.tokenType,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.AUTH_LOGIN)
  @ApiOperation({ summary: 'Logout current session' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = AuthCookieHelper.getRefreshTokenFromCookie(
      req.cookies,
      this.config,
    );
    await this.commandBus.execute(new LogoutCommand(user.sub, refreshToken));
    AuthCookieHelper.clearRefreshCookie(res, this.config);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.AUTH_SESSION_REVOKE_ALL)
  @ApiOperation({ summary: 'Revoke all sessions for current user' })
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.commandBus.execute(new LogoutAllCommand(user.sub));
    AuthCookieHelper.clearRefreshCookie(res, this.config);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponseDto> {
    return this.commandBus.execute(new ForgotPasswordCommand(dto.email));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.commandBus.execute(
      new ResetPasswordCommand(dto.token, dto.newPassword),
    );
  }

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.AUTH_MFA_MANAGE)
  @ApiOperation({ summary: 'Generate MFA secret and QR code' })
  async mfaSetup(
    @CurrentUser() user: JwtPayload,
  ): Promise<MfaSetupResponseDto> {
    return this.commandBus.execute(new MfaSetupCommand(user.sub));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA code and enable MFA' })
  async mfaVerify(@Body() dto: MfaVerifyDto): Promise<MfaVerifyResponseDto> {
    const result = await this.commandBus.execute(
      new MfaVerifyCommand(dto.email, dto.mfaCode),
    );
    return result;
  }
}
