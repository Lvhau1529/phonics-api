import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/auth.types';
import { GamesService } from '../games.service';
import { UnlockWithGemsDto } from './dto';

/** Game của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'me/games', version: API_V1 })
export class MeGamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.games.studentGames(user.id);
  }

  /** Idempotent → 200 thay vì 201 */
  @HttpCode(200)
  @Post(':gameId/unlock')
  unlock(@CurrentUser() user: AuthUser, @Param('gameId') gameId: string, @Body() body: UnlockWithGemsDto) {
    return this.games.unlockWithGems(user.id, gameId, body);
  }
}
