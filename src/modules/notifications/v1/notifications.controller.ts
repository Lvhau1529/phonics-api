import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MarkReadBody, NotificationListQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/auth.types';
import { NotificationsService } from '../notifications.service';

class NotificationListQueryDto extends createZodDto(NotificationListQuery) {}
class MarkReadDto extends createZodDto(MarkReadBody) {}

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me/notifications', version: API_V1 })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationListQueryDto) {
    return this.notifications.list(user.id, query);
  }

  @Patch('read')
  markRead(@CurrentUser() user: AuthUser, @Body() body: MarkReadDto) {
    return this.notifications.markRead(user.id, body);
  }
}
