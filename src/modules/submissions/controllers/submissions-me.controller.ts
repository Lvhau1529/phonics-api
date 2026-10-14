import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { SubmissionReaderService } from '@/modules/submissions/services/submission-reader.service';
import { SubmissionStudentService } from '@/modules/submissions/services/submission-student.service';
import { SaveAnswersDto } from '@/modules/submissions/dto/requests/submissions.dto';

/** Làm bài của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'me', version: API_V1 })
export class SubmissionsMeController {
  constructor(
    private readonly reader: SubmissionReaderService,
    private readonly submissions: SubmissionStudentService,
  ) {}

  /** 201 attempt mới, 200 nếu đang có attempt IN_PROGRESS */
  @Post('assignments/:id/submissions')
  async start(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) assignmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, detail } = await this.submissions.start(user, assignmentId);
    res.status(created ? 201 : 200);
    return detail;
  }

  @Get('submissions/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.getForStudent(user, id);
  }

  /** Autosave */
  @Put('submissions/:id/answers')
  saveAnswers(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveAnswersDto,
  ) {
    return this.submissions.saveAnswers(user, id, body);
  }

  @Post('submissions/:id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.submissions.submit(user, id);
  }
}
