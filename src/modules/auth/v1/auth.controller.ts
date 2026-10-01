import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthResponse } from '@phonics/contracts';
import { type Request, type Response } from 'express';
import { CurrentUser, MaybeUser } from '../../../common/decorators/current-user.decorator';
import { OptionalAuth, Public } from '../../../common/decorators/public.decorator';
import { API_V1 } from '../../../config/api-version';
import { THROTTLE } from '../../../config/constants';
import { ENV } from '../../../config/env.module';
import { type Env } from '../../../config/env.schema';
import { type AuthResult, AuthService } from '../auth.service';
import { type AuthUser } from '../auth.types';
import { ChangePasswordDto, GoogleDto, LoginDto, LogoutDto, RefreshDto, RegisterDto } from './dto';
import {
  clearRefreshCookie,
  presentedRefreshToken,
  setRefreshCookie,
  transportOf,
} from './refresh-transport';

const authThrottle = { default: { limit: THROTTLE.auth.limit, ttl: THROTTLE.auth.ttl } };

@ApiTags('auth')
@Controller({ path: 'auth', version: API_V1 })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle(authThrottle)
  @Post('register')
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.register(body, meta(req)));
  }

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
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() body: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = presentedRefreshToken(req, body.refreshToken);
    return this.respond(req, res, await this.auth.refresh(presented, meta(req)));
  }

  /** Đăng xuất thiết bị này (hoặc `all: true` mọi thiết bị, cần access token) */
  @OptionalAuth()
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
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @ApiBearerAuth()
  @HttpCode(204)
  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto): Promise<void> {
    await this.auth.changePassword(user, body);
  }

  /** Trả refresh token theo transport client chọn (cookie hoặc body) */
  private respond(req: Request, res: Response, result: AuthResult): AuthResponse {
    const { refreshToken, ...rest } = result;
    if (transportOf(req) === 'body') return { ...rest, refreshToken };
    setRefreshCookie(res, this.env, refreshToken);
    return rest;
  }
}

function meta(req: Request): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}
