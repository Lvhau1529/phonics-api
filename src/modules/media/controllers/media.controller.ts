import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { THROTTLE } from '@/config/constants';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { MediaService } from '@/modules/media/services/media.service';
import { CompleteMediaDto, PresignMediaDto } from '@/modules/media/dto/requests/media.dto';

const mediaThrottle = { default: { limit: THROTTLE.media.limit, ttl: THROTTLE.media.ttl } };

/**
 * Upload ảnh / audio: mọi người đã đăng nhập (GV: nội dung câu hỏi; HS: ghi âm, tô chữ).
 * Luồng: POST presign → client PUT lên uploadUrl → POST :id/complete.
 */
@ApiTags('media')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER', 'STUDENT')
@Controller({ path: 'media', version: API_V1 })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Throttle(mediaThrottle)
  @Post('presign')
  presign(@CurrentUser() user: AuthUser, @Body() body: PresignMediaDto) {
    return this.media.presign(user, body);
  }

  /** Idempotent → 200 */
  @HttpCode(200)
  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteMediaDto,
  ) {
    return this.media.complete(user, id, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.get(user, id);
  }
}
