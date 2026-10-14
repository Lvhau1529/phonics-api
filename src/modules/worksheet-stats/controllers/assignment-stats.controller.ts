import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { AssignmentStatsService } from '@/modules/worksheet-stats/services/assignment-stats.service';

/** GET /assignments/:id/stats — đặt ở module này để tránh import vòng với module assignments */
@ApiTags('assignments')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('worksheets.viewStats')
@Controller({ path: 'assignments', version: API_V1 })
export class AssignmentStatsController {
  constructor(private readonly stats: AssignmentStatsService) {}

  @Get(':id/stats')
  assignment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stats.assignmentStats(user, id);
  }
}
