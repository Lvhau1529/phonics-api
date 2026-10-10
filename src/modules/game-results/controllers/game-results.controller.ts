import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { THROTTLE } from '../../../config/constants';
import { type AuthUser } from '../../auth/types/auth.types';
import { GameResultDto } from '../dto/requests/game-results.dto';
import { GameResultWriterService } from '../services/game-result-writer.service';

/** Game client nộp kết quả ván */
@ApiTags('game')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'game', version: API_V1 })
export class GameResultsController {
  constructor(private readonly results: GameResultWriterService) {}

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
