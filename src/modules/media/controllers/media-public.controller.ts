import { Controller, HttpCode, Param, ParseUUIDPipe, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type Request } from 'express';
import { Public } from '@/common/decorators/public.decorator';
import { API_V1 } from '@/config/api-version';
import { THROTTLE } from '@/config/constants';
import { MediaUploadQueryDto } from '@/modules/media/dto/requests/media.dto';
import { MediaService } from '@/modules/media/services/media.service';

const mediaThrottle = { default: { limit: THROTTLE.media.limit, ttl: THROTTLE.media.ttl } };

/**
 * PUT byte file lên `uploadUrl` trả từ POST /media/presign (ADR 0024). Không bearer: client (XMLHttpRequest) chỉ gửi
 * header trong `headers` của presign; quyền ghi nằm ở chữ ký `exp` + `sig` trên query.
 */
@ApiTags('media')
@Public()
@Controller({ path: 'media', version: API_V1 })
export class MediaPublicController {
  constructor(private readonly media: MediaService) {}

  @Throttle(mediaThrottle)
  @HttpCode(204)
  @Put(':id/upload')
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() link: MediaUploadQueryDto,
    @Req() req: Request,
  ): Promise<void> {
    const length = Number(req.headers['content-length']);
    await this.media.upload(
      id,
      link,
      {
        contentType: req.headers['content-type'] ?? '',
        contentLength: Number.isFinite(length) ? length : undefined,
      },
      req,
    );
  }
}
