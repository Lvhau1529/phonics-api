import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../common/decorators/roles.decorator';
import { RangeQueryDto } from '../common/dto';
import { DistributionQueryDto, GameTimelineQueryDto, TimelineQueryDto, TopStudentsQueryDto } from './dto';
import { StatsService } from './stats.service';

/** Thống kê (admin + giáo viên có quyền stats.view; phạm vi lớp kiểm tra trong service) */
@ApiTags('stats')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('stats.view')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** ADMIN: toàn hệ thống; TEACHER: chỉ các lớp mình dạy */
  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.stats.overview(user);
  }

  @Get('classes/:id/points-timeline')
  pointsTimeline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: TimelineQueryDto,
  ) {
    return this.stats.classPointsTimeline(user, classId, query);
  }

  @Get('classes/:id/top-students')
  topStudents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: TopStudentsQueryDto,
  ) {
    return this.stats.classTopStudents(user, classId, query);
  }

  @Get('classes/:id/distribution')
  distribution(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: DistributionQueryDto,
  ) {
    return this.stats.classDistribution(user, classId, query);
  }

  @Get('classes/:id/games')
  classGames(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: RangeQueryDto,
  ) {
    return this.stats.classGames(user, classId, query);
  }

  /** Đếm trên mọi sự kiện của game (không giới hạn theo lớp) */
  @Get('games/:id/timeline')
  gameTimeline(@Param('id') gameId: string, @Query() query: GameTimelineQueryDto) {
    return this.stats.gameTimeline(gameId, query);
  }

  @Get('games/:id/by-class')
  gameByClass(@CurrentUser() user: AuthUser, @Param('id') gameId: string, @Query() query: RangeQueryDto) {
    return this.stats.gameByClass(user, gameId, query);
  }
}
