import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { PointsListQueryDto, RankingQueryDto } from '@/modules/points/dto/requests/points.dto';
import { PointReaderService } from '@/modules/points/services/point-reader.service';

/** Điểm của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'me', version: API_V1 })
export class PointsMeController {
  constructor(private readonly points: PointReaderService) {}

  @Get('points')
  myPoints(@CurrentUser() user: AuthUser, @Query() query: RankingQueryDto) {
    return this.points.myPoints(user, query);
  }

  @Get('points/history')
  history(@CurrentUser() user: AuthUser, @Query() query: PointsListQueryDto) {
    return this.points.list({ ...query, studentId: user.id, classId: undefined });
  }
}
