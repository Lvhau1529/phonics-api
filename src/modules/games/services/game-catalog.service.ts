import { Injectable } from '@nestjs/common';
import {
  type GameAdminItem,
  type GameCatalogItem,
  type PublicGamesResponse,
  type UpdateGameBody,
} from '@phonics/contracts';
import { notFound } from '../../../common/errors/app-error';
import { AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { toAdminItem, toCatalogItem } from '../dto/responses/game.view';
import { GameRepository } from '../repositories/game.repository';
import { type GameRow } from '../types/game.types';

/** Catalog game: danh sách công khai, trang quản trị (kèm số liệu), sửa catalog */
@Injectable()
export class GameCatalogService {
  constructor(
    private readonly repo: GameRepository,
    private readonly audit: AuditService,
  ) {}

  async getGame(gameId: string): Promise<GameRow> {
    const game = await this.repo.findById(gameId);
    if (!game) throw notFound('Không tìm thấy game');
    return game;
  }

  /** GET /public/games — trả cả game đang tắt để client tự ẩn */
  async listPublic(): Promise<PublicGamesResponse> {
    return { items: (await this.repo.findAll()).map(toCatalogItem) };
  }

  /** GET /admin/games — catalog + lượt xem / chơi / người chơi / học sinh đã mở */
  async adminList(): Promise<{ items: GameAdminItem[] }> {
    const [games, stats] = await Promise.all([this.repo.findAll(), this.repo.adminStats()]);
    return { items: games.map((g) => toAdminItem(g, stats)) };
  }

  /** PATCH /admin/games/:id */
  async update(actor: AuthUser, gameId: string, body: UpdateGameBody): Promise<GameCatalogItem> {
    const before = toCatalogItem(await this.getGame(gameId));
    const after = toCatalogItem(await this.repo.update(gameId, body));
    await this.audit.record(actor, 'game.update', 'Game', gameId, before, after);
    return after;
  }
}
