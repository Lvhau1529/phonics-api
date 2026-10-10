import { Injectable } from '@nestjs/common';
import { type UpdateGameBody } from '@phonics/contracts';
import { PrismaService } from '../../../database/prisma.service';
import { type Tx } from '../../../database/types';
import {
  type GameAdminStats,
  type GameGate,
  type GameRow,
  type GameStats,
  type UnlockRow,
} from '../types/game.types';

/** Ghi mở khoá do GV / admin cấp */
export interface AdminGrant {
  grantedById: string;
  note?: string;
}

/** Mọi truy vấn Prisma về catalog game và mở khoá (games, student_game_unlocks, game_events) */
@Injectable()
export class GameRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // ---------- catalog ----------

  /** Thứ tự catalog: sort_order, id */
  findAll(): Promise<GameRow[]> {
    return this.prisma.game.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  }

  findById(id: string): Promise<GameRow | null> {
    return this.prisma.game.findUnique({ where: { id } });
  }

  update(id: string, data: UpdateGameBody): Promise<GameRow> {
    return this.prisma.game.update({ where: { id }, data });
  }

  /** Lượt xem / chơi, người chơi duy nhất (user đăng nhập theo user_id, khách theo client_id), học sinh đã mở */
  async adminStats(): Promise<GameAdminStats> {
    const [events, players, unlocks] = await Promise.all([
      this.prisma.gameEvent.groupBy({ by: ['gameId', 'type'], _count: { _all: true } }),
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
    return {
      views,
      plays,
      uniquePlayers: new Map(players.map((p) => [p.gameId, p.players])),
      unlockedStudents: new Map(unlocks.map((u) => [u.gameId, u._count._all])),
    };
  }

  // ---------- trạng thái của học sinh ----------

  /** Điểm (GAME + BONUS) và số ván của học sinh, gom theo game (tuỳ chọn lọc một game) */
  async statsByGame(studentId: string, gameId?: string): Promise<Map<string, GameStats>> {
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

  findUnlock(studentId: string, gameId: string): Promise<UnlockRow | null> {
    return this.prisma.studentGameUnlock.findUnique({ where: { studentId_gameId: { studentId, gameId } } });
  }

  findActiveUnlocks(studentId: string): Promise<UnlockRow[]> {
    return this.prisma.studentGameUnlock.findMany({ where: { studentId, revokedAt: null } });
  }

  async studentExists(studentId: string): Promise<boolean> {
    return !!(await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { userId: true },
    }));
  }

  async classExists(classId: string): Promise<boolean> {
    return !!(await this.prisma.class.findUnique({ where: { id: classId }, select: { id: true } }));
  }

  async activeMemberIds(classId: string): Promise<string[]> {
    const rows = await this.prisma.classMembership.findMany({
      where: { classId, leftAt: null },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  unlocksOf(gameId: string, studentIds: readonly string[]) {
    return this.prisma.studentGameUnlock.findMany({
      where: { gameId, studentId: { in: [...studentIds] } },
      select: { studentId: true, revokedAt: true },
    });
  }

  // ---------- ghi mở khoá ----------

  async createGemsUnlock(studentId: string, gameId: string, gemsSpent: number): Promise<void> {
    await this.prisma.studentGameUnlock.create({ data: { studentId, gameId, source: 'GEMS', gemsSpent } });
  }

  /** Mở khoá do GV / admin (tạo mới hoặc hồi phục dòng đã thu hồi) */
  async grant(tx: Tx, studentId: string, gameId: string, grant: AdminGrant, at: Date): Promise<void> {
    await tx.studentGameUnlock.upsert({
      where: { studentId_gameId: { studentId, gameId } },
      create: { studentId, gameId, source: 'ADMIN', ...grant },
      update: { source: 'ADMIN', ...grant, revokedAt: null, unlockedAt: at },
    });
  }

  async revoke(tx: Tx, studentId: string, gameId: string, at: Date): Promise<void> {
    await tx.studentGameUnlock.updateMany({
      where: { studentId, gameId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async grantMany(tx: Tx, gameId: string, studentIds: readonly string[], grant: AdminGrant): Promise<void> {
    if (!studentIds.length) return;
    await tx.studentGameUnlock.createMany({
      data: studentIds.map((studentId) => ({ studentId, gameId, source: 'ADMIN' as const, ...grant })),
    });
  }

  async reviveMany(
    tx: Tx,
    gameId: string,
    studentIds: readonly string[],
    grant: AdminGrant,
    at: Date,
  ): Promise<void> {
    if (!studentIds.length) return;
    await tx.studentGameUnlock.updateMany({
      where: { gameId, studentId: { in: [...studentIds] } },
      data: { source: 'ADMIN', ...grant, revokedAt: null, unlockedAt: at },
    });
  }

  /** Game có tồn tại / đang bật / học sinh đã mở khoá chưa (trong transaction của người gọi) */
  async gate(tx: Tx, studentId: string, gameId: string): Promise<GameGate> {
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
