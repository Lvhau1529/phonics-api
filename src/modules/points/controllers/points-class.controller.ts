import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { AccessService } from '../../../core/access/access.service';
import { type AuthUser } from '../../auth/types/auth.types';
import {
  AwardBonusBatchDto,
  AwardBonusDto,
  PointsListQueryDto,
  RankingQueryDto,
} from '../dto/requests/points.dto';
import { PointBonusService } from '../services/point-bonus.service';
import { PointReaderService } from '../services/point-reader.service';

/** Điểm theo lớp (admin + GV của lớp) */
@ApiTags('classes')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'classes/:classId', version: API_V1 })
export class PointsClassController {
  constructor(
    private readonly points: PointReaderService,
    private readonly bonusService: PointBonusService,
    private readonly access: AccessService,
  ) {}

  @Get('ranking')
  async ranking(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: RankingQueryDto,
  ) {
    await this.access.assertClassAccess(user, classId);
    return this.points.classRanking(classId, query);
  }

  @Get('points')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: PointsListQueryDto,
  ) {
    await this.access.assertClassAccess(user, classId);
    return this.points.list({ ...query, classId });
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
