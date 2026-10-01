import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../common/decorators/roles.decorator';
import { AppError } from '../common/errors/app-error';
import { UnlockClassDto } from './dto';
import { GamesService } from './games.service';

/** Mở khoá game cho cả lớp */
@ApiTags('classes')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller('classes/:classId/games')
export class ClassGamesController {
  constructor(private readonly games: GamesService) {}

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
