import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { GamesService } from './games.service';

/** Catalog game cho client chưa đăng nhập (cache 60s ở trình duyệt / CDN) */
@ApiTags('public')
@Controller('public')
export class PublicGamesController {
  constructor(private readonly games: GamesService) {}

  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @Get('games')
  list() {
    return this.games.listPublic();
  }
}
