import { type GameResultBody, POINT_RULES } from '@phonics/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { type DeepMockProxy, mock, mockDeep, mockReset } from 'vitest-mock-extended';
import { AppError } from '../common/errors/app-error';
import { type TimeService } from '../common/time/time.service';
import { type EventsService } from '../events/events.service';
import { type GamesService } from '../games/games.service';
import { Prisma } from '../generated/prisma/client';
import { type PointsService } from '../points/points.service';
import { type RankingService } from '../points/ranking.service';
import { type PrismaService } from '../prisma/prisma.service';
import { computePoints, GameResultsService } from './game-results.service';

const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const CLASS_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const RESULT_ID = '55555555-5555-4555-8555-555555555555';

const body = (overrides: Partial<GameResultBody> = {}): GameResultBody => ({
  clientSessionId: SESSION_ID,
  gameId: 'bread-catcher',
  mode: 'solo',
  levelId: 'level-1',
  correct: 7,
  total: 10,
  score: 700,
  endedBy: 'completed',
  playedAt: new Date(Date.now() - 10_000).toISOString(),
  details: {},
  ...overrides,
});

/** Dòng game_results như Prisma trả về sau create / findUnique */
const resultRow = (b: GameResultBody, pointsAwarded: number, pointsReason: string | null = null) => ({
  id: RESULT_ID,
  studentId: STUDENT_ID,
  classId: CLASS_ID,
  gameId: b.gameId,
  mode: 'solo',
  levelId: b.levelId,
  packId: b.packId ?? null,
  correct: b.correct,
  total: b.total,
  score: b.score,
  durationMs: b.durationMs ?? null,
  endedBy: b.endedBy,
  playedAt: new Date(b.playedAt),
  clientSessionId: b.clientSessionId,
  pointsAwarded,
  pointsReason,
  details: {},
  createdAt: new Date(),
});

const TODAY = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-02T00:00:00Z') };

describe('computePoints', () => {
  const open = { enabled: true, unlocked: true };

  it('min(maxPerRound, correct × perCorrect)', () => {
    expect(computePoints(3, open, CLASS_ID, 0)).toEqual({ points: 3, reason: null });
    expect(computePoints(50, open, CLASS_ID, 0)).toEqual({ points: POINT_RULES.maxPerRound, reason: null });
    expect(computePoints(0, open, CLASS_ID, 0)).toEqual({ points: 0, reason: null });
  });

  it('game tắt / khoá / chưa có lớp → 0 điểm kèm lý do', () => {
    expect(computePoints(5, { enabled: false, unlocked: true }, CLASS_ID, 0).reason).toBe('GAME_DISABLED');
    expect(computePoints(5, { enabled: true, unlocked: false }, CLASS_ID, 0).reason).toBe('GAME_LOCKED');
    expect(computePoints(5, open, null, 0)).toEqual({ points: 0, reason: 'NO_CLASS' });
  });

  it('trần ngày cắt phần vượt', () => {
    const cap = POINT_RULES.dailyCap ?? 0;
    expect(computePoints(8, open, CLASS_ID, cap - 3)).toEqual({ points: 3, reason: 'DAILY_CAP' });
    expect(computePoints(8, open, CLASS_ID, cap)).toEqual({ points: 0, reason: 'DAILY_CAP' });
    expect(computePoints(8, open, CLASS_ID, cap - 8)).toEqual({ points: 8, reason: null });
  });
});

describe('GameResultsService.submit', () => {
  let prisma: DeepMockProxy<PrismaService>;
  const games = mock<GamesService>();
  const ranking = mock<RankingService>();
  const points = mock<PointsService>();
  const events = mock<EventsService>();
  const time = mock<TimeService>();
  let service: GameResultsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    for (const m of [games, ranking, points, events, time]) mockReset(m);
    // Transaction gọi callback với chính mock (tx === prisma)
    (prisma.$transaction as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      (cb: (tx: unknown) => Promise<unknown>) => cb(prisma),
    );
    time.dayRange.mockReturnValue(TODAY);
    points.totals.mockImplementation(async (_id, range) => ({
      total: range ? 5 : 42,
      byKind: { GAME: range ? 5 : 40, BONUS: range ? 0 : 2 },
      byGame: [{ gameId: 'bread-catcher', points: range ? 5 : 30, rounds: 3 }],
    }));
    ranking.currentRank.mockResolvedValue({ classId: CLASS_ID, rank: 2, members: 10 });
    ranking.recomputeAndNotify.mockResolvedValue({ previous: 3, current: 2 });
    events.recordPlay.mockResolvedValue(undefined);
    prisma.gameResult.findUnique.mockResolvedValue(null);
    prisma.classMembership.findFirst.mockResolvedValue({ classId: CLASS_ID } as never);
    games.isUnlockedFor.mockResolvedValue({ exists: true, enabled: true, unlocked: true });
    prisma.pointEntry.aggregate.mockResolvedValue({ _sum: { points: 0 } } as never);
    service = new GameResultsService(prisma, games, ranking, points, events, time);
  });

  const expectAppError = async (promise: Promise<unknown>, code: string, status: number) => {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    expect((err as AppError).getStatus()).toBe(status);
  };

  it('game không có trong GAME_REGISTRY → 400 UNKNOWN_GAME, không chạm DB', async () => {
    await expectAppError(
      service.submit(STUDENT_ID, body({ gameId: 'no-such-game' as GameResultBody['gameId'] })),
      'UNKNOWN_GAME',
      400,
    );
    expect(prisma.gameResult.findUnique).not.toHaveBeenCalled();
  });

  it('total vượt maxTotal → 400 RESULT_IMPLAUSIBLE', async () => {
    await expectAppError(
      service.submit(STUDENT_ID, body({ correct: 61, total: 61 })),
      'RESULT_IMPLAUSIBLE',
      400,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('playedAt quá cũ → 400 PLAYED_AT_OUT_OF_RANGE', async () => {
    const old = new Date(Date.now() - POINT_RULES.playedAtMaxAgeMs - 60_000).toISOString();
    await expectAppError(service.submit(STUDENT_ID, body({ playedAt: old })), 'PLAYED_AT_OUT_OF_RANGE', 400);
  });

  it('details quá lớn → 400 DETAILS_TOO_LARGE', async () => {
    const details = { blob: 'x'.repeat(POINT_RULES.maxDetailsBytes) };
    await expectAppError(service.submit(STUDENT_ID, body({ details })), 'DETAILS_TOO_LARGE', 400);
  });

  it('gửi lại ván đã ghi → duplicate: true, không tạo gì thêm', async () => {
    const b = body();
    prisma.gameResult.findUnique.mockResolvedValue(resultRow(b, 7) as never);

    const res = await service.submit(STUDENT_ID, b);

    expect(res).toMatchObject({ resultId: RESULT_ID, duplicate: true, pointsAwarded: 7 });
    expect(res.pointsReason).toBeUndefined();
    expect(res.totals).toEqual({ all: 42, today: 5, game: 30 });
    expect(res.rank).toEqual({ previous: 2, current: 2 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.gameResult.create).not.toHaveBeenCalled();
    expect(prisma.pointEntry.create).not.toHaveBeenCalled();
    expect(events.recordPlay).not.toHaveBeenCalled();
  });

  it('happy path: cộng min(10, correct) điểm, tính lại hạng, ghi PLAY event', async () => {
    const b = body({ correct: 7 });
    prisma.gameResult.create.mockResolvedValue(resultRow(b, 7) as never);

    const res = await service.submit(STUDENT_ID, b);

    expect(prisma.gameResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: STUDENT_ID,
          classId: CLASS_ID,
          clientSessionId: SESSION_ID,
          pointsAwarded: 7,
          pointsReason: null,
        }),
      }),
    );
    expect(prisma.pointEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        gameId: 'bread-catcher',
        kind: 'GAME',
        points: 7,
        gameResultId: RESULT_ID,
        note: 'bread-catcher · level-1 · 7/10',
      }),
    });
    expect(ranking.recomputeAndNotify).toHaveBeenCalledWith(prisma, CLASS_ID, STUDENT_ID);
    expect(events.recordPlay).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ gameId: 'bread-catcher', userId: STUDENT_ID, mode: 'solo' }),
    );
    expect(res).toMatchObject({
      duplicate: false,
      pointsAwarded: 7,
      rank: { previous: 3, current: 2 },
      totals: { all: 42, today: 5, game: 30 },
    });
  });

  it('happy path: correct lớn hơn maxPerRound → trần 10 điểm', async () => {
    const b = body({ correct: 25, total: 30, score: 3000 });
    prisma.gameResult.create.mockResolvedValue(resultRow(b, 10) as never);

    await service.submit(STUDENT_ID, b);

    expect(prisma.pointEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ points: 10 }) });
  });

  it('game chưa mở khoá → 0 điểm, GAME_LOCKED, không có bút toán / tính hạng', async () => {
    const b = body();
    games.isUnlockedFor.mockResolvedValue({ exists: true, enabled: true, unlocked: false });
    prisma.gameResult.create.mockResolvedValue(resultRow(b, 0, 'GAME_LOCKED') as never);

    const res = await service.submit(STUDENT_ID, b);

    expect(prisma.gameResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pointsAwarded: 0, pointsReason: 'GAME_LOCKED' }),
      }),
    );
    expect(prisma.pointEntry.create).not.toHaveBeenCalled();
    expect(ranking.recomputeAndNotify).not.toHaveBeenCalled();
    expect(events.recordPlay).toHaveBeenCalled();
    expect(res).toMatchObject({
      pointsAwarded: 0,
      pointsReason: 'GAME_LOCKED',
      rank: { previous: 2, current: 2 },
    });
  });

  it('game không tồn tại trong catalog → 400 UNKNOWN_GAME', async () => {
    games.isUnlockedFor.mockResolvedValue({ exists: false, enabled: false, unlocked: false });
    await expectAppError(service.submit(STUDENT_ID, body()), 'UNKNOWN_GAME', 400);
    expect(prisma.gameResult.create).not.toHaveBeenCalled();
  });

  it('trần ngày: đã nhận 57 hôm nay, ván 7 đúng → chỉ 3 điểm, DAILY_CAP', async () => {
    const b = body({ correct: 7 });
    const cap = POINT_RULES.dailyCap ?? 0;
    prisma.pointEntry.aggregate.mockResolvedValue({ _sum: { points: cap - 3 } } as never);
    prisma.gameResult.create.mockResolvedValue(resultRow(b, 3, 'DAILY_CAP') as never);

    const res = await service.submit(STUDENT_ID, b);

    expect(prisma.pointEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: STUDENT_ID,
          kind: 'GAME',
          createdAt: { gte: TODAY.from, lt: TODAY.to },
        }),
      }),
    );
    expect(prisma.gameResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pointsAwarded: 3, pointsReason: 'DAILY_CAP' }),
      }),
    );
    expect(prisma.pointEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ points: 3 }) });
    expect(res).toMatchObject({ pointsAwarded: 3, pointsReason: 'DAILY_CAP' });
  });

  it('trần ngày đã đầy → 0 điểm DAILY_CAP, không có bút toán', async () => {
    const b = body({ correct: 7 });
    prisma.pointEntry.aggregate.mockResolvedValue({ _sum: { points: POINT_RULES.dailyCap } } as never);
    prisma.gameResult.create.mockResolvedValue(resultRow(b, 0, 'DAILY_CAP') as never);

    await service.submit(STUDENT_ID, b);

    expect(prisma.pointEntry.create).not.toHaveBeenCalled();
    expect(ranking.recomputeAndNotify).not.toHaveBeenCalled();
  });

  it('không thuộc lớp nào → 0 điểm NO_CLASS, classId null', async () => {
    const b = body();
    prisma.classMembership.findFirst.mockResolvedValue(null);
    prisma.gameResult.create.mockResolvedValue({ ...resultRow(b, 0, 'NO_CLASS'), classId: null } as never);

    const res = await service.submit(STUDENT_ID, b);

    expect(prisma.gameResult.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ classId: null, pointsReason: 'NO_CLASS' }) }),
    );
    expect(prisma.pointEntry.create).not.toHaveBeenCalled();
    expect(res.pointsReason).toBe('NO_CLASS');
  });

  it('thua cuộc đua unique (P2002) → đọc lại ván đã ghi, duplicate: true', async () => {
    const b = body();
    prisma.gameResult.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );
    prisma.gameResult.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(resultRow(b, 7) as never);

    const res = await service.submit(STUDENT_ID, b);

    expect(res).toMatchObject({ duplicate: true, pointsAwarded: 7 });
    expect(prisma.pointEntry.create).not.toHaveBeenCalled();
  });
});
