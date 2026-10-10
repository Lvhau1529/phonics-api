import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { GameResultListQueryDto } from '../dto/requests/game-results.dto';
import { GameResultReaderService } from '../services/game-result-reader.service';

/** Lịch sử ván của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'me', version: API_V1 })
export class GameResultsMeController {
  constructor(private readonly results: GameResultReaderService) {}

  @Get('game-results')
  list(@CurrentUser() user: AuthUser, @Query() query: GameResultListQueryDto) {
    return this.results.listMine(user.id, query);
  }
}
