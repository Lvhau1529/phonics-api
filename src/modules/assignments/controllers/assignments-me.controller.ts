import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { AssignmentStudentService } from '@/modules/assignments/services/assignment-student.service';
import { MyAssignmentListQueryDto } from '@/modules/assignments/dto/requests/assignments.dto';

/** Bài tập của chính học sinh (lớp đang học). Bắt đầu làm bài: POST /me/assignments/:id/submissions (module submissions). */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'me/assignments', version: API_V1 })
export class AssignmentsMeController {
  constructor(private readonly assignments: AssignmentStudentService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: MyAssignmentListQueryDto) {
    return this.assignments.list(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.detail(user, id);
  }

  @Get(':id/ranking')
  ranking(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.ranking(user, id);
  }
}
