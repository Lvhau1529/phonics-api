import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AwardBonusBatchBody, AwardBonusBody, PointsListQuery, RankingQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access/access.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../common/decorators/roles.decorator';
import { PointsService } from './points.service';

class RankingQueryDto extends createZodDto(RankingQuery) {}
class PointsListQueryDto extends createZodDto(PointsListQuery) {}
class AwardBonusDto extends createZodDto(AwardBonusBody) {}
class AwardBonusBatchDto extends createZodDto(AwardBonusBatchBody) {}

/** Điểm của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MePointsController {
  constructor(private readonly points: PointsService) {}

  @Roles('STUDENT')
  @Get('points')
  myPoints(@CurrentUser() user: AuthUser, @Query() query: RankingQueryDto) {
    return this.points.myPoints(user, query);
  }

  @Roles('STUDENT')
  @Get('points/history')
  history(@CurrentUser() user: AuthUser, @Query() query: PointsListQueryDto) {
    return this.points.list({ ...query, studentId: user.id, classId: undefined });
  }

  @Roles('STUDENT')
  @Get('class/ranking')
  ranking(@CurrentUser() user: AuthUser, @Query() query: RankingQueryDto) {
    return this.points.myClassRanking(user, query);
  }
}

/** Điểm theo lớp (admin + GV của lớp) */
@ApiTags('classes')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller('classes/:classId')
export class ClassPointsController {
  constructor(
    private readonly points: PointsService,
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
    return this.points.awardBonus(user, classId, body);
  }

  @RequirePermission('points.award')
  @Post('points/bonus/batch')
  async bonusBatch(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: AwardBonusBatchDto,
  ) {
    return { entries: await this.points.awardBonusBatch(user, classId, body) };
  }
}
