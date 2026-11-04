import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@/common/decorators/public.decorator';
import { API_V1 } from '@/config/api-version';
import { THROTTLE } from '@/config/constants';
import { CancelDigestDto, ConfirmDigestDto } from '@/modules/extra-lessons/dto/requests/extra.dto';
import { AttendanceDigestService } from '@/modules/extra-lessons/services/attendance-digest.service';

const tokenThrottle = { default: { limit: THROTTLE.auth.limit, ttl: THROTTLE.auth.ttl } };

/** Trang duyệt nhanh từ mail 21:00 (không đăng nhập, theo token trong link) */
@ApiTags('attendance')
@Public()
@Throttle(tokenThrottle)
@Controller({ path: 'attendance/public/digests', version: API_V1 })
export class AttendancePublicController {
  constructor(private readonly digests: AttendanceDigestService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.digests.view(token);
  }

  @HttpCode(200)
  @Post(':token/confirm')
  confirm(@Param('token') token: string, @Body() body: ConfirmDigestDto) {
    return this.digests.confirm(token, body);
  }

  /** GV báo nghỉ buổi trong mail (buổi còn chờ xác nhận) */
  @HttpCode(200)
  @Post(':token/cancel')
  cancel(@Param('token') token: string, @Body() body: CancelDigestDto) {
    return this.digests.cancel(token, body);
  }
}
