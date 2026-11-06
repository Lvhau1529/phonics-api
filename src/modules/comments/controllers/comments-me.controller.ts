import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { CommentsService } from '@/modules/comments/services/comments.service';

/** Nhận xét của GV trên bài của chính học sinh — chỉ xem (bé / phụ huynh không trả lời) */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'me/submissions', version: API_V1 })
export class CommentsMeController {
  constructor(private readonly comments: CommentsService) {}

  @Get(':id/comments')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comments.list(user, id);
  }
}
