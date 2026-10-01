import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/auth.types';
import { GamesService } from '../games.service';
import { UpdateGameDto } from './dto';

/** Quản trị catalog game */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/games', version: API_V1 })
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
