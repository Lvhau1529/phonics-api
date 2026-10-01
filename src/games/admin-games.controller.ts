import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../common/decorators/roles.decorator';
import { UpdateGameDto } from './dto';
import { GamesService } from './games.service';

/** Quản trị catalog game */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/games')
export class AdminGamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list() {
    return this.games.adminList();
  }

  @RequirePermission('games.manage')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') gameId: string, @Body() body: UpdateGameDto) {
    return this.games.update(user, gameId, body);
  }
}
