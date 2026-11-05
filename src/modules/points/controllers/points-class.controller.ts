import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  AwardBonusBatchDto,
  AwardBonusDto,
  PointsListQueryDto,
  RankingQueryDto,
} from '@/modules/points/dto/requests/points.dto';
import { PointBonusService } from '@/modules/points/services/point-bonus.service';
import { PointReaderService } from '@/modules/points/services/point-reader.service';

/** Điểm theo lớp (admin + GV của lớp) */
@ApiTags('classes')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'classes/:classId', version: API_V1 })
export class PointsClassController {
  constructor(
    private readonly points: PointReaderService,
    private readonly bonusService: PointBonusService,
  ) {}

  @Get('ranking')
  ranking(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: RankingQueryDto,
  ) {
    return this.points.classRankingFor(user, classId, query);
  }

  @Get('points')
  list(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: PointsListQueryDto,
  ) {
    return this.points.classPoints(user, classId, query);
  }

  @RequirePermission('points.award')
  @Post('points/bonus')
  bonus(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: AwardBonusDto,
  ) {
    return this.bonusService.awardBonus(user, classId, body);
  }

  @RequirePermission('points.award')
  @Post('points/bonus/batch')
  async bonusBatch(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: AwardBonusBatchDto,
  ) {
    return { entries: await this.bonusService.awardBonusBatch(user, classId, body) };
  }
}
