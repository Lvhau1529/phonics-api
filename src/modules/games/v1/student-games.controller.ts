import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/auth.types';
import { GamesService } from '../games.service';
import { SetStudentGameUnlockDto } from './dto';

/** Game theo học sinh (admin + GV của lớp; phạm vi kiểm tra trong service) */
@ApiTags('students')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'students/:id/games', version: API_V1 })
export class StudentGamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.games.studentGamesFor(user, studentId);
  }

  @RequirePermission('games.unlock')
  @Put(':gameId')
  set(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) studentId: string,
    @Param('gameId') gameId: string,
    @Body() body: SetStudentGameUnlockDto,
  ) {
    return this.games.setStudentUnlock(user, studentId, gameId, body);
  }
}
