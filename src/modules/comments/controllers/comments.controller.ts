import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { UpdateCommentDto } from '@/modules/comments/dto/requests/comments.dto';
import { CommentsService } from '@/modules/comments/services/comments.service';

/** Sửa / xoá một nhận xét (tác giả; admin xoá được) */
@ApiTags('submissions')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER', 'STUDENT')
@Controller({ path: 'comments', version: API_V1 })
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCommentDto,
  ) {
    return this.comments.update(user, id, body);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.comments.remove(user, id);
  }
}
