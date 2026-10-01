import { Injectable } from '@nestjs/common';
import {
  type AwardBonusBatchBody,
  type AwardBonusBody,
  type AwardBonusResponse,
  type MyPointsResponse,
  type Paginated,
  type PointEntryView,
  type PointsByGame,
  type PointsListQuery,
  type RankingQuery,
  type RankingResponse,
} from '@phonics/contracts';
import { AuditService } from '../audit/audit.service';
import { type AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access/access.service';
import { AppError, notFound } from '../common/errors/app-error';
import { paginate } from '../common/pagination/paginate';
import { TimeService } from '../common/time/time.service';
import { type Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { type Tx } from '../prisma/types';
import { RankingService } from './ranking.service';

const entryInclude = {
  student: { select: { user: { select: { displayName: true } } } },
  class: { select: { name: true } },
  createdBy: { select: { displayName: true } },
} satisfies Prisma.PointEntryInclude;

type EntryRow = Prisma.PointEntryGetPayload<{ include: typeof entryInclude }>;

export function toEntryView(row: EntryRow): PointEntryView {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.user.displayName,
    classId: row.classId,
    className: row.class?.name ?? null,
    gameId: (row.gameId as PointEntryView['gameId']) ?? null,
    kind: row.kind,
    points: row.points,
    note: row.note,
    gameResultId: row.gameResultId,
    createdById: row.createdById,
    createdByName: row.createdBy?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class PointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
    private readonly notifications: NotificationsService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly time: TimeService,
  ) {}

  /** Tổng điểm của học sinh theo khoảng thời gian (+ theo game) */
  async totals(studentId: string, range: { from: Date; to: Date } | null, tx: Tx = this.prisma) {
    const where: Prisma.PointEntryWhereInput = {
      studentId,
      createdAt: range ? { gte: range.from, lt: range.to } : undefined,
    };
    const [byKind, byGame] = await Promise.all([
      tx.pointEntry.groupBy({ by: ['kind'], where, _sum: { points: true } }),
      tx.pointEntry.groupBy({
        by: ['gameId'],
        where: { ...where, gameId: { not: null } },
        _sum: { points: true },
        _count: { _all: true },
      }),
    ]);
    const kind = { GAME: 0, BONUS: 0 };
    for (const k of byKind) kind[k.kind] = k._sum.points ?? 0;
    const games: PointsByGame[] = byGame.map((g) => ({
      gameId: g.gameId as PointsByGame['gameId'],
      points: g._sum.points ?? 0,
      rounds: g._count._all,
    }));
    return { total: kind.GAME + kind.BONUS, byKind: kind, byGame: games };
  }

  /** GET /me/points */
  async myPoints(user: AuthUser, query: RankingQuery): Promise<MyPointsResponse> {
    const range = this.time.resolveRange(query);
    const totals = await this.totals(user.id, range);
    const current = await this.ranking.currentRank(user.id);
    let cls: MyPointsResponse['class'] = null;
    if (current) {
      const row = await this.prisma.class.findUnique({
        where: { id: current.classId },
        select: { name: true },
      });
      cls = { id: current.classId, name: row?.name ?? '', rank: current.rank, members: current.members };
    }
    const byGame = query.gameId ? totals.byGame.filter((g) => g.gameId === query.gameId) : totals.byGame;
    return { ...totals, byGame, class: cls, range: { range: query.range, from: query.from, to: query.to } };
  }

  /** GET /me/class/ranking */
  async myClassRanking(user: AuthUser, query: RankingQuery): Promise<RankingResponse> {
    const membership = await this.prisma.classMembership.findFirst({
      where: { studentId: user.id, leftAt: null },
      select: { classId: true },
    });
    if (!membership) throw new AppError('NOT_FOUND', 404, { message: 'Bạn chưa thuộc lớp nào' });
    return this.classRanking(membership.classId, query, user.id);
  }

  async classRanking(classId: string, query: RankingQuery, meId?: string): Promise<RankingResponse> {
    const cls = await this.prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
    if (!cls) throw notFound('Không tìm thấy lớp');
    const items = await this.ranking.rankingEntries(
      classId,
      { range: this.time.resolveRange(query), gameId: query.gameId ?? null },
      meId,
    );
    return {
      classId,
      className: cls.name,
      gameId: query.gameId ?? null,
      range: { range: query.range, from: query.from, to: query.to },
      items,
      me: items.find((i) => i.isMe) ?? null,
    };
  }

  /** Sổ điểm (lọc theo lớp / học sinh / loại / game / thời gian) — caller đã kiểm tra scope */
  async list(query: PointsListQuery): Promise<Paginated<PointEntryView>> {
    const range = this.time.resolveRange(query);
    const where: Prisma.PointEntryWhereInput = {
      studentId: query.studentId,
      classId: query.classId,
      kind: query.kind,
      gameId: query.gameId,
      createdAt: range ? { gte: range.from, lt: range.to } : undefined,
    };
    return paginate(
      query,
      async (args) =>
        (
          await this.prisma.pointEntry.findMany({
            where,
            ...args,
            orderBy: { createdAt: 'desc' },
            include: entryInclude,
          })
        ).map(toEntryView),
      () => this.prisma.pointEntry.count({ where }),
    );
  }

  /** GV / admin cộng (hoặc trừ) điểm thưởng cho một học sinh trong lớp */
  async awardBonus(actor: AuthUser, classId: string, body: AwardBonusBody): Promise<AwardBonusResponse> {
    await this.access.assertClassAccess(actor, classId);
    if (body.points < 0 && actor.role !== 'ADMIN') {
      // Trừ điểm cần quyền riêng (points.revoke) — kiểm tra ở đây vì guard không biết dấu của points
      throw new AppError('FORBIDDEN_PERMISSION', 403, { details: { permission: ['points.revoke'] } });
    }
    const membership = await this.prisma.classMembership.findFirst({
      where: { studentId: body.studentId, classId, leftAt: null },
      select: { id: true },
    });
    if (!membership) throw new AppError('NOT_FOUND', 404, { message: 'Học sinh không thuộc lớp này' });

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.pointEntry.create({
        data: {
          studentId: body.studentId,
          classId,
          gameId: body.gameId,
          kind: 'BONUS',
          points: body.points,
          note: body.note,
          createdById: actor.id,
        },
        include: entryInclude,
      });
      const actorName =
        (await tx.user.findUnique({ where: { id: actor.id }, select: { displayName: true } }))?.displayName ??
        'your teacher';
      await this.notifications.create(
        {
          userId: body.studentId,
          type: 'BONUS_AWARDED',
          title: `${body.points > 0 ? '+' : ''}${body.points} points from ${actorName}`,
          body: body.note,
          data: {
            pointEntryId: row.id,
            classId,
            points: body.points,
            byUserId: actor.id,
            gameId: body.gameId ?? null,
          },
        },
        tx,
      );
      const rank = await this.ranking.recomputeAndNotify(tx, classId, body.studentId);
      return { entry: toEntryView(row), rank };
    });
    await this.audit.record(actor, 'points.bonus', 'PointEntry', result.entry.id, null, body);
    return result;
  }

  /** Nhiều học sinh một lần: một transaction, một lần tính lại hạng */
  async awardBonusBatch(
    actor: AuthUser,
    classId: string,
    body: AwardBonusBatchBody,
  ): Promise<PointEntryView[]> {
    await this.access.assertClassAccess(actor, classId);
    if (actor.role !== 'ADMIN' && body.entries.some((e) => e.points < 0)) {
      throw new AppError('FORBIDDEN_PERMISSION', 403, { details: { permission: ['points.revoke'] } });
    }
    const members = await this.prisma.classMembership.findMany({
      where: { classId, leftAt: null, studentId: { in: body.entries.map((e) => e.studentId) } },
      select: { studentId: true },
    });
    const memberIds = new Set(members.map((m) => m.studentId));
    const missing = body.entries.filter((e) => !memberIds.has(e.studentId));
    if (missing.length) throw new AppError('NOT_FOUND', 404, { message: 'Có học sinh không thuộc lớp này' });

    const entries = await this.prisma.$transaction(async (tx) => {
      const actorName =
        (await tx.user.findUnique({ where: { id: actor.id }, select: { displayName: true } }))?.displayName ??
        'your teacher';
      const rows: EntryRow[] = [];
      for (const e of body.entries) {
        rows.push(
          await tx.pointEntry.create({
            data: {
              studentId: e.studentId,
              classId,
              gameId: e.gameId,
              kind: 'BONUS',
              points: e.points,
              note: e.note,
              createdById: actor.id,
            },
            include: entryInclude,
          }),
        );
      }
      await this.notifications.createMany(
        rows.map((row) => ({
          userId: row.studentId,
          type: 'BONUS_AWARDED' as const,
          title: `${row.points > 0 ? '+' : ''}${row.points} points from ${actorName}`,
          body: row.note ?? '',
          data: { pointEntryId: row.id, classId, points: row.points, byUserId: actor.id, gameId: row.gameId },
        })),
        tx,
      );
      await this.ranking.recomputeAndNotify(tx, classId);
      return rows.map(toEntryView);
    });
    await this.audit.record(actor, 'points.bonus', 'Class', classId, null, {
      count: entries.length,
      entries: body.entries,
    });
    return entries;
  }
}
