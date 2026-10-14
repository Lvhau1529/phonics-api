import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { AppError } from '@/common/errors/app-error';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { GameUnlockService } from '@/modules/games/services/game-unlock.service';
import { UnlockClassDto } from '@/modules/games/dto/requests/games.dto';

/** Mở khoá game cho cả lớp */
@ApiTags('classes')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'classes/:classId/games', version: API_V1 })
export class GamesClassController {
  constructor(private readonly games: GameUnlockService) {}

  /** Contracts có `classId` trong body: param là nguồn sự thật, body phải khớp */
  @RequirePermission('games.unlock')
  @Post(':gameId/unlock')
  unlock(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('gameId') gameId: string,
    @Body() body: UnlockClassDto,
  ) {
    if (body.classId !== classId) {
      throw new AppError('VALIDATION_ERROR', 400, {
        details: { classId: ['classId phải trùng với classId trên URL'] },
      });
    }
    return this.games.unlockClass(user, classId, gameId, body);
  }
}
