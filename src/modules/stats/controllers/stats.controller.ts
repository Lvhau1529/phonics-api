import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { RangeQueryDto } from '../../../common/dto/query.dto';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { ClassStatsService } from '../services/class-stats.service';
import { GameStatsService } from '../services/game-stats.service';
import { OverviewStatsService } from '../services/overview-stats.service';
import {
  DistributionQueryDto,
  GameTimelineQueryDto,
  TimelineQueryDto,
  TopStudentsQueryDto,
} from '../dto/requests/stats.dto';

/** Thống kê (admin + giáo viên có quyền stats.view; phạm vi lớp kiểm tra trong service) */
@ApiTags('stats')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('stats.view')
@Controller({ path: 'stats', version: API_V1 })
export class StatsController {
  constructor(
    private readonly overviewStats: OverviewStatsService,
    private readonly classStats: ClassStatsService,
    private readonly gameStats: GameStatsService,
  ) {}

  /** ADMIN: toàn hệ thống; TEACHER: chỉ các lớp mình dạy */
  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.overviewStats.overview(user);
  }

  @Get('classes/:id/points-timeline')
  pointsTimeline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: TimelineQueryDto,
  ) {
    return this.classStats.pointsTimeline(user, classId, query);
  }

  @Get('classes/:id/top-students')
  topStudents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: TopStudentsQueryDto,
  ) {
    return this.classStats.topStudents(user, classId, query);
  }

  @Get('classes/:id/distribution')
  distribution(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: DistributionQueryDto,
  ) {
    return this.classStats.distribution(user, classId, query);
  }

  @Get('classes/:id/games')
  classGames(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: RangeQueryDto,
  ) {
    return this.classStats.games(user, classId, query);
  }

  /** Đếm trên mọi sự kiện của game (không giới hạn theo lớp) */
  @Get('games/:id/timeline')
  gameTimeline(@Param('id') gameId: string, @Query() query: GameTimelineQueryDto) {
    return this.gameStats.timeline(gameId, query);
  }

  @Get('games/:id/by-class')
  gameByClass(@CurrentUser() user: AuthUser, @Param('id') gameId: string, @Query() query: RangeQueryDto) {
    return this.gameStats.byClass(user, gameId, query);
  }
}
