import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import { AllowParent, AllowPending } from '@/common/decorators/account.decorator';
import { CurrentUser, MaybeUser } from '@/common/decorators/current-user.decorator';
import { OptionalAuth, Public } from '@/common/decorators/public.decorator';
import { API_V1 } from '@/config/api-version';
import { THROTTLE } from '@/config/constants';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import {
  ChangePasswordDto,
  GoogleDto,
  LinkGoogleDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
} from '@/modules/auth/dto/requests/auth.dto';
import { AuthService } from '@/modules/auth/services/auth.service';
import { GoogleLinkService } from '@/modules/auth/services/google-link.service';
import { type AuthResult, type AuthUser } from '@/modules/auth/types/auth.types';
import {
  clearRefreshCookie,
  presentedRefreshToken,
  respondWithTokens,
} from '@/modules/auth/utils/refresh-transport';

const authThrottle = { default: { limit: THROTTLE.auth.limit, ttl: THROTTLE.auth.ttl } };
const refreshThrottle = { default: { limit: THROTTLE.refresh.limit, ttl: THROTTLE.refresh.ttl } };

@ApiTags('auth')
@Controller({ path: 'auth', version: API_V1 })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly googleLinks: GoogleLinkService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.login(body, meta(req)));
  }

  @Public()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('google')
  async google(@Body() body: GoogleDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.googleSignIn(body, meta(req)));
  }

  @Public()
  @Throttle(refreshThrottle)
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() body: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = presentedRefreshToken(req, body.refreshToken);
    return this.respond(req, res, await this.auth.refresh(presented, meta(req)));
  }

  /** Đăng xuất thiết bị này (hoặc `all: true` mọi thiết bị, cần access token) */
  @OptionalAuth()
  @AllowPending()
  @AllowParent()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Body() body: LogoutDto,
    @MaybeUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(presentedRefreshToken(req, body.refreshToken), user, body.all);
    clearRefreshCookie(res, this.env);
  }

  @ApiBearerAuth()
  @AllowPending()
  @AllowParent()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @ApiBearerAuth()
  @AllowPending()
  @AllowParent()
  @HttpCode(204)
  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto): Promise<void> {
    await this.auth.changePassword(user, body);
  }

  /** Liên kết Google vào tài khoản đang đăng nhập → user (kèm `loginMethods`) */
  @ApiBearerAuth()
  @AllowPending()
  @AllowParent()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('google/link')
  linkGoogle(@CurrentUser() user: AuthUser, @Body() body: LinkGoogleDto) {
    return this.googleLinks.link(user, body.idToken);
  }

  /** Gỡ Google (phải còn mật khẩu) → user */
  @ApiBearerAuth()
  @AllowPending()
  @AllowParent()
  @Delete('google/link')
  unlinkGoogle(@CurrentUser() user: AuthUser) {
    return this.googleLinks.unlink(user);
  }

  /** Trả refresh token theo transport client chọn (cookie hoặc body) */
  private respond(req: Request, res: Response, result: AuthResult) {
    return respondWithTokens(req, res, this.env, result);
  }
}

function meta(req: Request): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}
