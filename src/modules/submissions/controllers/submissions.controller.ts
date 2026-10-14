import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { SubmissionGradingService } from '@/modules/submissions/services/submission-grading.service';
import { SubmissionReaderService } from '@/modules/submissions/services/submission-reader.service';
import { GradeSubmissionDto } from '@/modules/submissions/dto/requests/submissions.dto';

/** Bài nộp — phía giáo viên (lớp mình) / admin. Nhận xét: module comments (`/submissions/:id/comments`). */
@ApiTags('submissions')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'submissions', version: API_V1 })
export class SubmissionsController {
  constructor(
    private readonly reader: SubmissionReaderService,
    private readonly grading: SubmissionGradingService,
  ) {}

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.getForTeacher(user, id);
  }

  @RequirePermission('worksheets.grade')
  @Put(':id/grade')
  grade(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GradeSubmissionDto,
  ) {
    return this.grading.grade(user, id, body);
  }

  @RequirePermission('worksheets.grade')
  @HttpCode(200)
  @Post(':id/reopen')
  reopen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.grading.reopen(user, id);
  }
}
