import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MaybeUser } from '../../../common/decorators/current-user.decorator';
import { OptionalAuth, Public } from '../../../common/decorators/public.decorator';
import { API_V1 } from '../../../config/api-version';
import { THROTTLE } from '../../../config/constants';
import { type AuthUser } from '../../auth/auth.types';
import { EventsService } from '../events.service';
import { EventBatchDto } from './dto';

/** Client gom sự kiện VIEW / PLAY rồi gửi theo lô; có bearer hợp lệ thì gắn userId */
@ApiTags('public')
@Controller({ path: 'public', version: API_V1 })
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Public()
  @OptionalAuth()
  @Throttle({ default: { limit: THROTTLE.events.limit, ttl: THROTTLE.events.ttl } })
  @HttpCode(200)
  @Post('events')
  ingest(@Body() body: EventBatchDto, @MaybeUser() user: AuthUser | undefined) {
    return this.events.ingest(body, user?.id ?? null);
  }
}
