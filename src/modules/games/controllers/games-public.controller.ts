import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { API_V1 } from '../../../config/api-version';
import { GameCatalogService } from '../services/game-catalog.service';

/** Catalog game cho client chưa đăng nhập (cache 60s ở trình duyệt / CDN) */
@ApiTags('public')
@Controller({ path: 'public', version: API_V1 })
export class GamesPublicController {
  constructor(private readonly games: GameCatalogService) {}

  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @Get('games')
  list() {
    return this.games.listPublic();
  }
}
