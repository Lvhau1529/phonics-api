import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { AssignmentReaderService } from '../services/assignment-reader.service';
import { AssignmentWriterService } from '../services/assignment-writer.service';
import {
  AssignmentListQueryDto,
  CreateAssignmentDto,
  UpdateAssignmentDto,
} from '../dto/requests/assignments.dto';

/** Bài giao (GV lớp mình / admin). Thống kê bài giao nằm ở module worksheet-stats (`/assignments/:id/stats`). */
@ApiTags('assignments')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'assignments', version: API_V1 })
export class AssignmentsController {
  constructor(
    private readonly reader: AssignmentReaderService,
    private readonly writer: AssignmentWriterService,
  ) {}

  /** Danh sách / lịch (from, to theo scheduledFor) */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AssignmentListQueryDto) {
    return this.reader.list(user, query);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.reader.dashboard(user);
  }

  @RequirePermission('worksheets.assign')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAssignmentDto) {
    return this.writer.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.get(user, id);
  }

  @RequirePermission('worksheets.assign')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAssignmentDto,
  ) {
    return this.writer.update(user, id, body);
  }

  @RequirePermission('worksheets.assign')
  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.writer.remove(user, id);
  }

  @RequirePermission('worksheets.assign')
  @HttpCode(200)
  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.close(user, id);
  }

  @RequirePermission('worksheets.assign')
  @HttpCode(200)
  @Post(':id/reopen')
  reopen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.reopen(user, id);
  }

  /** Roster: mỗi học sinh một dòng (kể cả chưa làm) */
  @Get(':id/submissions')
  roster(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.roster(user, id);
  }

  @Get(':id/ranking')
  ranking(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.ranking(user, id);
  }
}
