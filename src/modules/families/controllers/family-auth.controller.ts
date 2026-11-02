import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthResponse } from '@phonics/contracts';
import { type Request, type Response } from 'express';
import { AllowPending } from '@/common/decorators/account.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { THROTTLE } from '@/config/constants';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { type AuthUser, type ClientMeta } from '@/modules/auth/types/auth.types';
import { respondWithTokens } from '@/modules/auth/utils/refresh-transport';
import {
  RegisterFamilyDto,
  SetPasswordDto,
  SwitchProfileDto,
} from '@/modules/families/dto/requests/families.dto';
import { FamilyRegistrationService } from '@/modules/families/services/family-registration.service';
import { FamilySessionService } from '@/modules/families/services/family-session.service';

const authThrottle = { default: { limit: THROTTLE.auth.limit, ttl: THROTTLE.auth.ttl } };

/** Tài khoản gia đình: đăng ký, chọn hồ sơ bé, đặt mật khẩu từ link mời (cùng nhóm route `auth/*`) */
@ApiTags('auth')
@Controller({ path: 'auth', version: API_V1 })
export class FamilyAuthController {
  constructor(
    private readonly registration: FamilyRegistrationService,
    private readonly sessions: FamilySessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Phụ huynh tự đăng ký + các bé → tài khoản PENDING (đăng nhập được, chờ duyệt) */
  @Public()
  @Throttle(authThrottle)
  @Post('register-family')
  async registerFamily(
    @Body() body: RegisterFamilyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return respondWithTokens(req, res, this.env, await this.registration.register(body, meta(req)));
  }

  @ApiBearerAuth()
  @Roles('PARENT')
  @AllowPending()
  @Get('profiles')
  profiles(@CurrentUser() user: AuthUser) {
    return this.registration.profiles(user);
  }

  /**
   * Vào hồ sơ bé → cặp token học sinh (claim `act` = phụ huynh). Refresh token **luôn trả trong body** (không ghi đè
   * cookie refresh của phụ huynh) — client giữ riêng để quay lại màn chọn bé.
   */
  @ApiBearerAuth()
  @Roles('PARENT')
  @HttpCode(200)
  @Post('switch-profile')
  switchProfile(@CurrentUser() user: AuthUser, @Body() body: SwitchProfileDto, @Req() req: Request) {
    return this.sessions.switchProfile(user, body.studentId, meta(req));
  }

  @Public()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('set-password')
  async setPassword(
    @Body() body: SetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return respondWithTokens(req, res, this.env, await this.sessions.setPassword(body, meta(req)));
  }
}

function meta(req: Request): ClientMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}
