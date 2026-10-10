import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { PointsListQueryDto, RankingQueryDto } from '../dto/requests/points.dto';
import { PointReaderService } from '../services/point-reader.service';

/** Điểm của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: API_V1 })
export class PointsMeController {
  constructor(private readonly points: PointReaderService) {}

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
