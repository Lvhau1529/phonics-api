import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { THROTTLE } from '../config/constants';
import { GameResultDto, GameResultListQueryDto } from './dto';
import { GameResultsService } from './game-results.service';

/** Game client nộp kết quả ván */
@ApiTags('game')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller('game')
export class GameResultsController {
  constructor(private readonly results: GameResultsService) {}

  /** 201 ván mới; 200 nếu gửi lại ván đã ghi (duplicate) */
  @Throttle({ default: { limit: THROTTLE.gameResults.limit, ttl: THROTTLE.gameResults.ttl } })
  @Post('results')
  async submit(
    @CurrentUser() user: AuthUser,
    @Body() body: GameResultDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.results.submit(user.id, body);
    if (result.duplicate) res.status(200);
    return result;
  }
}

/** Lịch sử ván của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller('me')
export class MeGameResultsController {
  constructor(private readonly results: GameResultsService) {}

  @Get('game-results')
  list(@CurrentUser() user: AuthUser, @Query() query: GameResultListQueryDto) {
    return this.results.listMine(user.id, query);
  }
}
