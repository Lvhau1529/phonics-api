/** Dựng view game (shape contracts) — hàm thuần */
import {
  type GameAdminItem,
  type GameCatalogItem,
  type GameId,
  type StudentGameStatus,
  type UnlockSource,
} from '@phonics/contracts';
import {
  type GameAdminStats,
  type GameRow,
  type GameStats,
  type UnlockRow,
} from '@/modules/games/types/game.types';

export function toCatalogItem(row: GameRow): GameCatalogItem {
  return {
    id: row.id as GameId,
    title: row.title,
    enabled: row.enabled,
    comingSoon: row.comingSoon,
    price: row.price,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminItem(row: GameRow, stats: GameAdminStats): GameAdminItem {
  return {
    ...toCatalogItem(row),
    views: stats.views.get(row.id) ?? 0,
    plays: stats.plays.get(row.id) ?? 0,
    uniquePlayers: stats.uniquePlayers.get(row.id) ?? 0,
    unlockedStudents: stats.unlockedStudents.get(row.id) ?? 0,
  };
}

/**
 * Trạng thái mở khoá của một game cho học sinh: game miễn phí (price null) luôn mở (source FREE),
 * còn lại cần dòng unlock đang hoạt động (revoked_at IS NULL).
 */
export function toStudentGameStatus(
  game: GameRow,
  unlock: UnlockRow | null | undefined,
  stats: GameStats,
): StudentGameStatus {
  const active = unlock && unlock.revokedAt == null ? unlock : null;
  let source: UnlockSource | null = null;
  let unlockedAt: string | null = null;
  if (game.price == null) {
    source = 'FREE';
  } else if (active) {
    source = active.source;
    unlockedAt = active.unlockedAt.toISOString();
  }
  return { gameId: game.id as GameId, unlocked: source !== null, source, unlockedAt, ...stats };
}

/** Thông báo "game mới mở" cho học sinh */
export const gameUnlockedNotification = (userId: string, game: Pick<GameRow, 'id' | 'title'>) => ({
  userId,
  type: 'GAME_UNLOCKED' as const,
  title: `New game unlocked: ${game.title}`,
  body: `Your teacher unlocked ${game.title}. Have fun!`,
  data: { gameId: game.id },
});
