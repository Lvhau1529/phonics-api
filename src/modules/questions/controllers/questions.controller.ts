import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { QuestionReaderService } from '@/modules/questions/services/question-reader.service';
import { QuestionWriterService } from '@/modules/questions/services/question-writer.service';
import {
  CreateQuestionDto,
  QuestionListQueryDto,
  UpdateQuestionDto,
} from '@/modules/questions/dto/requests/questions.dto';

/** Ngân hàng câu hỏi: GV (quyền worksheets.manage) và admin. Phạm vi chủ sở hữu kiểm tra trong service. */
@ApiTags('questions')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('worksheets.manage')
@Controller({ path: 'questions', version: API_V1 })
export class QuestionsController {
  constructor(
    private readonly reader: QuestionReaderService,
    private readonly writer: QuestionWriterService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QuestionListQueryDto) {
    return this.reader.list(user, query);
  }

  @Get('tags')
  tags(@CurrentUser() user: AuthUser) {
    return this.reader.tags(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateQuestionDto) {
    return this.writer.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.writer.update(user, id, body);
  }

  @HttpCode(200)
  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.publish(user, id);
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.archive(user, id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.duplicate(user, id);
  }
}
