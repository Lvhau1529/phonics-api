import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { CreateCommentDto } from '../dto/requests/comments.dto';
import { CommentsService } from '../services/comments.service';

/** Nhận xét trên bài nộp — phía giáo viên */
@ApiTags('submissions')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'submissions', version: API_V1 })
export class CommentsTeacherController {
  constructor(private readonly comments: CommentsService) {}

  @Get(':id/comments')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comments.list(user, id);
  }

  @RequirePermission('worksheets.grade')
  @Post(':id/comments')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.comments.create(user, id, body);
  }
}
