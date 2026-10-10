import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { StudentWorksheetStatsService } from '../services/student-worksheet-stats.service';

/** Thống kê phiếu của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'me/worksheet-stats', version: API_V1 })
export class WorksheetStatsMeController {
  constructor(private readonly stats: StudentWorksheetStatsService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.stats.studentStats(user, user.id);
  }
}
