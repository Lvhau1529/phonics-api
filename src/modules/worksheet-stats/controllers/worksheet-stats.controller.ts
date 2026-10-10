import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { WorksheetStatsQueryDto } from '../dto/requests/worksheet-stats.dto';
import { ClassWorksheetStatsService } from '../services/class-worksheet-stats.service';
import { StudentWorksheetStatsService } from '../services/student-worksheet-stats.service';

/** Thống kê phiếu theo lớp / học sinh (perm worksheets.viewStats) */
@ApiTags('worksheet-stats')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('worksheets.viewStats')
@Controller({ path: 'worksheet-stats', version: API_V1 })
export class WorksheetStatsController {
  constructor(
    private readonly classes: ClassWorksheetStatsService,
    private readonly students: StudentWorksheetStatsService,
  ) {}

  @Get('classes/:id/overview')
  classOverview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WorksheetStatsQueryDto,
  ) {
    return this.classes.classOverview(user, id, query);
  }

  @Get('students/:id')
  student(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.studentStats(user, id);
  }
}
