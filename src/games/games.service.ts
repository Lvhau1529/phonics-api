import { Injectable } from '@nestjs/common';
import {
  type GameAdminItem,
  type GameCatalogItem,
  type GameId,
  type PublicGamesResponse,
  type SetStudentGameUnlockBody,
  type StudentGameStatus,
  type StudentGamesResponse,
  type UnlockClassBody,
  type UnlockClassResponse,
  type UnlockSource,
  type UnlockWithGemsBody,
  type UpdateGameBody,
} from '@phonics/contracts';
import { AuditService } from '../audit/audit.service';
import { type AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access/access.service';
import { AppError, notFound } from '../common/errors/app-error';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { type Tx } from '../prisma/types';

/** Dòng bảng `games` (đủ cột cho GameCatalogItem) */
interface GameRow {
  id: string;
  title: string;
  enabled: boolean;
  comingSoon: boolean;
  price: number | null;
  sortOrder: number;
  updatedAt: Date;
}

/** Dòng `student_game_unlocks` — chỉ các cột cần cho trạng thái */
interface UnlockRow {
  gameId: string;
  source: 'GEMS' | 'ADMIN';
  unlockedAt: Date;
  revokedAt: Date | null;
}

/** Điểm + số ván của học sinh ở một game */
interface GameStats {
  points: number;
  rounds: number;
}

const NO_STATS: GameStats = { points: 0, rounds: 0 };

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

/**
 * Trạng thái mở khoá của một game cho học sinh: game miễn phí (price null) luôn mở (source FREE),
 * còn lại cần dòng unlock đang hoạt động (revoked_at IS NULL).
 */
function toStatus(game: GameRow, unlock: UnlockRow | null | undefined, stats: GameStats): StudentGameStatus {
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

const notifyUnlocked = (userId: string, game: GameRow) => ({
  userId,
  type: 'GAME_UNLOCKED' as const,
  title: `New game unlocked: ${game.title}`,
  body: `Your teacher unlocked ${game.title}. Have fun!`,
  data: { gameId: game.id },
});

/** Catalog game + mở khoá theo học sinh / lớp. Thứ tự catalog: sort_order, id. */
@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private allGames(): Promise<GameRow[]> {
    return this.prisma.game.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  }

  private async getGame(gameId: string): Promise<GameRow> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw notFound('Không tìm thấy game');
    return game;
  }

  /** GET /public/games — trả cả game đang tắt để client tự ẩn */
  async listPublic(): Promise<PublicGamesResponse> {
    return { items: (await this.allGames()).map(toCatalogItem) };
  }

  /** Điểm (GAME + BONUS) và số ván của học sinh, gom theo game (tuỳ chọn lọc một game) */
  private async statsByGame(studentId: string, gameId?: string): Promise<Map<string, GameStats>> {
    const [points, rounds] = await Promise.all([
      this.prisma.pointEntry.groupBy({
        by: ['gameId'],
        where: { studentId, gameId: gameId ?? { not: null } },
        _sum: { points: true },
      }),
      this.prisma.gameResult.groupBy({
        by: ['gameId'],
        where: { studentId, gameId },
        _count: { _all: true },
      }),
    ]);
    const map = new Map<string, GameStats>();
    const at = (id: string): GameStats => {
      let s = map.get(id);
      if (!s) map.set(id, (s = { points: 0, rounds: 0 }));
      return s;
    };
    for (const p of points) if (p.gameId) at(p.gameId).points = p._sum.points ?? 0;
    for (const r of rounds) at(r.gameId).rounds = r._count._all;
    return map;
  }

  private async statusOf(studentId: string, game: GameRow): Promise<StudentGameStatus> {
    const [unlock, stats] = await Promise.all([
      this.prisma.studentGameUnlock.findUnique({
        where: { studentId_gameId: { studentId, gameId: game.id } },
      }),
      this.statsByGame(studentId, game.id),
    ]);
    return toStatus(game, unlock, stats.get(game.id) ?? NO_STATS);
  }

  /** GET /me/games — một dòng cho mỗi game trong catalog */
  async studentGames(studentId: string): Promise<StudentGamesResponse> {
    const [games, unlocks, stats] = await Promise.all([
      this.allGames(),
      this.prisma.studentGameUnlock.findMany({ where: { studentId, revokedAt: null } }),
      this.statsByGame(studentId),
    ]);
    const unlockByGame = new Map(unlocks.map((u) => [u.gameId, u]));
    return { items: games.map((g) => toStatus(g, unlockByGame.get(g.id), stats.get(g.id) ?? NO_STATS)) };
  }

  /** GET /students/:id/games — ADMIN mọi học sinh, TEACHER chỉ học sinh lớp mình */
  async studentGamesFor(actor: AuthUser, studentId: string): Promise<StudentGamesResponse> {
    await this.access.assertStudentAccess(actor, studentId);
    return this.studentGames(studentId);
  }

  /**
   * POST /me/games/:gameId/unlock — client đã trừ kim cương, server chỉ ghi nhận. Idempotent:
   * đã mở → trả nguyên trạng; bị giáo viên thu hồi → 403; game miễn phí → không tạo dòng.
   */
  async unlockWithGems(
    studentId: string,
    gameId: string,
    body: UnlockWithGemsBody,
  ): Promise<StudentGameStatus> {
    const game = await this.getGame(gameId);
    if (game.price == null) return this.statusOf(studentId, game);
    const existing = await this.prisma.studentGameUnlock.findUnique({
      where: { studentId_gameId: { studentId, gameId } },
    });
    if (existing?.revokedAt) {
      throw new AppError('FORBIDDEN', 403, { message: 'Game is locked by your teacher' });
    }
    if (!existing) {
      await this.prisma.studentGameUnlock.create({
        data: { studentId, gameId, source: 'GEMS', gemsSpent: body.gemsSpent },
      });
    }
    return this.statusOf(studentId, game);
  }

  /** PUT /students/:id/games/:gameId — admin / GV (games.unlock) mở hoặc thu hồi */
  async setStudentUnlock(
    actor: AuthUser,
    studentId: string,
    gameId: string,
    body: SetStudentGameUnlockBody,
  ): Promise<StudentGameStatus> {
    await this.access.assertStudentAccess(actor, studentId);
    const game = await this.getGame(gameId);
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { userId: true },
    });
    if (!student) throw notFound('Không tìm thấy học sinh');

    const before = await this.statusOf(studentId, game);
    // Chỉ thông báo khi trước đó chưa có dòng unlock đang hoạt động (FREE không tính)
    const wasActive = before.source === 'GEMS' || before.source === 'ADMIN';
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (body.unlocked) {
        await tx.studentGameUnlock.upsert({
          where: { studentId_gameId: { studentId, gameId } },
          create: { studentId, gameId, source: 'ADMIN', grantedById: actor.id, note: body.note },
          update: {
            source: 'ADMIN',
            grantedById: actor.id,
            note: body.note,
            revokedAt: null,
            unlockedAt: now,
          },
        });
        if (!wasActive) await this.notifications.create(notifyUnlocked(studentId, game), tx);
      } else {
        await tx.studentGameUnlock.updateMany({
          where: { studentId, gameId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
    });

    const after = await this.statusOf(studentId, game);
    await this.audit.record(
      actor,
      'game.unlock',
      'StudentGameUnlock',
      `${studentId}:${gameId}`,
      { unlocked: before.unlocked, source: before.source },
      { unlocked: after.unlocked, source: after.source, note: body.note ?? null },
    );
    return after;
  }

  /**
   * POST /classes/:classId/games/:gameId/unlock — mở cho mọi thành viên đang hoạt động:
   * bỏ qua ai đã mở, hồi phục dòng bị thu hồi, tạo mới cho người chưa có.
   */
  async unlockClass(
    actor: AuthUser,
    classId: string,
    gameId: string,
    body: Pick<UnlockClassBody, 'note'>,
  ): Promise<UnlockClassResponse> {
    await this.access.assertClassAccess(actor, classId);
    const game = await this.getGame(gameId);
    const cls = await this.prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
    if (!cls) throw notFound('Không tìm thấy lớp');

    const members = await this.prisma.classMembership.findMany({
      where: { classId, leftAt: null },
      select: { studentId: true },
    });
    const memberIds = members.map((m) => m.studentId);
    // Game miễn phí: ai cũng đã mở, không có gì để làm
    if (game.price == null || !memberIds.length) return { unlocked: 0, alreadyUnlocked: memberIds.length };

    const existing = await this.prisma.studentGameUnlock.findMany({
      where: { gameId, studentId: { in: memberIds } },
      select: { studentId: true, revokedAt: true },
    });
    const activeCount = existing.filter((u) => u.revokedAt == null).length;
    const revivedIds = existing.filter((u) => u.revokedAt != null).map((u) => u.studentId);
    const knownIds = new Set(existing.map((u) => u.studentId));
    const newIds = memberIds.filter((id) => !knownIds.has(id));
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (newIds.length) {
        await tx.studentGameUnlock.createMany({
          data: newIds.map((studentId) => ({
            studentId,
            gameId,
            source: 'ADMIN' as const,
            grantedById: actor.id,
            note: body.note,
          })),
        });
      }
      if (revivedIds.length) {
        await tx.studentGameUnlock.updateMany({
          where: { gameId, studentId: { in: revivedIds } },
          data: { source: 'ADMIN', grantedById: actor.id, note: body.note, revokedAt: null, unlockedAt: now },
        });
      }
      await this.notifications.createMany(
        [...newIds, ...revivedIds].map((id) => notifyUnlocked(id, game)),
        tx,
      );
    });

    const result = { unlocked: newIds.length + revivedIds.length, alreadyUnlocked: activeCount };
    await this.audit.record(actor, 'game.unlockClass', 'Class', classId, null, {
      gameId,
      note: body.note ?? null,
      ...result,
    });
    return result;
  }

  /** GET /admin/games — catalog + lượt xem / chơi / người chơi / học sinh đã mở */
  async adminList(): Promise<{ items: GameAdminItem[] }> {
    const [games, events, players, unlocks] = await Promise.all([
      this.allGames(),
      this.prisma.gameEvent.groupBy({ by: ['gameId', 'type'], _count: { _all: true } }),
      // Người chơi duy nhất: user đã đăng nhập đếm theo user_id, khách đếm theo client_id
      this.prisma.$queryRaw<{ gameId: string; players: number }[]>`
        SELECT game_id AS "gameId",
               COUNT(DISTINCT COALESCE(user_id::text, client_id::text))::int AS players
        FROM   game_events
        GROUP  BY game_id`,
      this.prisma.studentGameUnlock.groupBy({
        by: ['gameId'],
        where: { revokedAt: null },
        _count: { _all: true },
      }),
    ]);
    const views = new Map<string, number>();
    const plays = new Map<string, number>();
    for (const e of events) (e.type === 'VIEW' ? views : plays).set(e.gameId, e._count._all);
    const uniquePlayers = new Map(players.map((p) => [p.gameId, p.players]));
    const unlocked = new Map(unlocks.map((u) => [u.gameId, u._count._all]));
    return {
      items: games.map((g) => ({
        ...toCatalogItem(g),
        views: views.get(g.id) ?? 0,
        plays: plays.get(g.id) ?? 0,
        uniquePlayers: uniquePlayers.get(g.id) ?? 0,
        unlockedStudents: unlocked.get(g.id) ?? 0,
      })),
    };
  }

  /** PATCH /admin/games/:id */
  async update(actor: AuthUser, gameId: string, body: UpdateGameBody): Promise<GameCatalogItem> {
    const before = toCatalogItem(await this.getGame(gameId));
    const after = toCatalogItem(await this.prisma.game.update({ where: { id: gameId }, data: body }));
    await this.audit.record(actor, 'game.update', 'Game', gameId, before, after);
    return after;
  }

  /** Cho module game-results: game có tồn tại / đang bật / học sinh đã mở khoá chưa (trong cùng transaction) */
  async isUnlockedFor(
    tx: Tx,
    studentId: string,
    gameId: string,
  ): Promise<{ unlocked: boolean; enabled: boolean; exists: boolean }> {
    const game = await tx.game.findUnique({ where: { id: gameId }, select: { enabled: true, price: true } });
    if (!game) return { exists: false, enabled: false, unlocked: false };
    if (game.price == null) return { exists: true, enabled: game.enabled, unlocked: true };
    const unlock = await tx.studentGameUnlock.findUnique({
      where: { studentId_gameId: { studentId, gameId } },
      select: { revokedAt: true },
    });
    return { exists: true, enabled: game.enabled, unlocked: !!unlock && unlock.revokedAt == null };
  }
}
