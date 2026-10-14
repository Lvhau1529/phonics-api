import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { GameUnlockService } from '@/modules/games/services/game-unlock.service';
import { UnlockWithGemsDto } from '@/modules/games/dto/requests/games.dto';

/** Game của chính học sinh */
@ApiTags('me')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller({ path: 'me/games', version: API_V1 })
export class GamesMeController {
  constructor(private readonly games: GameUnlockService) {}

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
