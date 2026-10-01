import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../common/decorators/roles.decorator';
import { SetStudentGameUnlockDto } from './dto';
import { GamesService } from './games.service';

/** Game theo học sinh (admin + GV của lớp; phạm vi kiểm tra trong service) */
@ApiTags('students')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller('students/:id/games')
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
