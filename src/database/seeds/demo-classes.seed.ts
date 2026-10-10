import { randomUUID } from 'node:crypto';
import { AVATARS, GAME_IDS } from '@phonics/contracts';
import { type Prisma, type PrismaClient } from '../../generated/prisma/client';
import { DEMO_PASSWORD, DEMO_TEACHER1, DEMO_TEACHER2, SCHOOL_YEAR, STUDENT_NAMES } from './demo.constants';
import { createRandom, DAY_MS, hashPassword } from './seed-helpers';

/** SQL xếp hạng — bản sao của src/modules/points/services/ranking.service.ts (rankClass, không lọc thời gian / game) */
async function rankClass(
  tx: Prisma.TransactionClient,
  classId: string,
): Promise<{ studentId: string; rank: number }[]> {
  return tx.$queryRaw<{ studentId: string; rank: number }[]>`
    SELECT m.student_id                                   AS "studentId",
           COALESCE(SUM(p.points), 0)::int                AS points,
           RANK() OVER (ORDER BY COALESCE(SUM(p.points), 0) DESC)::int AS rank
    FROM   class_memberships m
    LEFT JOIN point_entries p
           ON p.student_id = m.student_id
    WHERE  m.class_id = ${classId}::uuid AND m.left_at IS NULL
    GROUP  BY m.student_id, m.joined_at
    ORDER  BY points DESC, m.joined_at ASC`;
}

/**
 * Demo lớp / học sinh (bỏ qua nếu đã có teacher1@demo.local): 2 giáo viên, 3 lớp, 24 học sinh, kết quả chơi 14 ngày,
 * điểm thưởng, sự kiện xem / chơi, hạng hiện tại.
 */
export async function seedDemoClasses(prisma: PrismaClient): Promise<void> {
  if (await prisma.user.findUnique({ where: { email: DEMO_TEACHER1 }, select: { id: true } })) {
    console.log('[seed] demo: đã có teacher1@demo.local — bỏ qua');
    return;
  }
  const random = createRandom(20261001);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  const summary = { teachers: 0, classes: 0, students: 0, results: 0, points: 0, bonus: 0, events: 0 };

  await prisma.$transaction(
    async (tx) => {
      const [teacher1, teacher2] = await Promise.all(
        [
          { email: DEMO_TEACHER1, displayName: 'Ms. Lan' },
          { email: DEMO_TEACHER2, displayName: 'Mr. Nam' },
        ].map((t) =>
          tx.user.create({
            data: { ...t, emailVerified: true, passwordHash, role: 'TEACHER', avatarKey: 'lion' },
            select: { id: true },
          }),
        ),
      );
      summary.teachers = 2;

      const classDefs = [
        { name: 'K2A', grade: 'K2', joinVisible: true, teachers: [teacher1.id] },
        { name: 'K2B', grade: 'K2', joinVisible: true, teachers: [teacher1.id, teacher2.id] },
        { name: 'K1A', grade: 'K1', joinVisible: false, teachers: [teacher2.id] },
      ];
      let nameIndex = 0;

      for (const def of classDefs) {
        const cls = await tx.class.create({
          data: {
            name: def.name,
            grade: def.grade,
            schoolYear: SCHOOL_YEAR,
            joinVisible: def.joinVisible,
            teachers: { create: def.teachers.map((teacherId) => ({ teacherId })) },
          },
          select: { id: true },
        });
        summary.classes += 1;
        const teacherId = def.teachers[0];
        const slug = def.name.toLowerCase();
        const studentIds: string[] = [];

        for (let i = 1; i <= 8; i += 1) {
          const displayName = STUDENT_NAMES[nameIndex % STUDENT_NAMES.length];
          nameIndex += 1;
          const joinedAt = new Date(now.getTime() - random.int(15, 40) * DAY_MS);
          const student = await tx.user.create({
            data: {
              email: `${slug}.student${String(i).padStart(2, '0')}@demo.local`,
              emailVerified: true,
              passwordHash,
              role: 'STUDENT',
              displayName,
              avatarKey: AVATARS[(nameIndex - 1) % AVATARS.length].key,
              studentProfile: {
                create: {
                  parentName: `${displayName}'s parent`,
                  parentEmail: `${slug}.parent${String(i).padStart(2, '0')}@demo.local`,
                  parentPhone: `09${String(random.int(10_000_000, 99_999_999))}`,
                  memberships: { create: { classId: cls.id, joinedAt } },
                },
              },
            },
            select: { id: true },
          });
          studentIds.push(student.id);
          summary.students += 1;

          // Kết quả chơi 14 ngày gần nhất, mỗi ván một bút toán GAME + sự kiện VIEW / PLAY
          const clientId = randomUUID();
          const rounds = random.int(3, 8);
          const resultData: Prisma.GameResultCreateManyInput[] = [];
          for (let r = 0; r < rounds; r += 1) {
            const gameId = random.pick(GAME_IDS);
            const total =
              gameId === 'bread-catcher' ? 5 : gameId === 'phonics-ocean' ? 12 : random.int(8, 12);
            const correct = random.int(Math.floor(total / 2), total);
            const playedAt = new Date(
              Math.floor(
                (now.getTime() - random.int(1, 14 * 24) * 3600 * 1000 - random.int(0, 3599) * 1000) / 1000,
              ) * 1000,
            );
            resultData.push({
              studentId: student.id,
              classId: cls.id,
              gameId,
              mode: 'solo',
              levelId: `level-${random.int(1, 3)}`,
              packId: gameId === 'bread-catcher' ? 'cvc-short-a' : null,
              correct,
              total,
              score: correct * 100,
              durationMs: random.int(45, 180) * 1000,
              endedBy: 'completed',
              playedAt,
              clientSessionId: randomUUID(),
              pointsAwarded: Math.min(10, correct),
              pointsReason: 'correct',
              createdAt: playedAt,
            });
          }
          const results = await tx.gameResult.createManyAndReturn({
            data: resultData,
            select: { id: true, gameId: true, playedAt: true, pointsAwarded: true },
          });
          summary.results += results.length;

          await tx.pointEntry.createMany({
            data: results.map((res) => ({
              studentId: student.id,
              classId: cls.id,
              gameId: res.gameId,
              kind: 'GAME' as const,
              points: res.pointsAwarded,
              gameResultId: res.id,
              createdAt: res.playedAt,
            })),
          });
          summary.points += results.length;

          const events: Prisma.GameEventCreateManyInput[] = results.flatMap((res) => [
            {
              gameId: res.gameId,
              type: 'VIEW' as const,
              userId: student.id,
              clientId,
              mode: 'solo',
              occurredAt: new Date(res.playedAt.getTime() - random.int(60, 600) * 1000),
            },
            {
              gameId: res.gameId,
              type: 'PLAY' as const,
              userId: student.id,
              clientId,
              mode: 'solo',
              occurredAt: res.playedAt,
            },
          ]);
          const created = await tx.gameEvent.createMany({ data: events, skipDuplicates: true });
          summary.events += created.count;
        }

        // Vài lượt thưởng của giáo viên trong 7 ngày gần nhất
        const bonusNotes = [
          'Great teamwork today!',
          'Helped a friend',
          'Read aloud beautifully',
          'Super focus',
        ];
        for (const studentId of [...studentIds].sort(() => random.int(0, 1) - 0.5).slice(0, 3)) {
          await tx.pointEntry.create({
            data: {
              studentId,
              classId: cls.id,
              kind: 'BONUS',
              points: random.pick([5, 5, 10]),
              note: random.pick(bonusNotes),
              createdById: teacherId,
              createdAt: new Date(now.getTime() - random.int(1, 7 * 24) * 3600 * 1000),
            },
          });
          summary.bonus += 1;
        }

        // Khách ẩn danh xem thẻ game
        const anonymous: Prisma.GameEventCreateManyInput[] = [];
        for (let k = 0; k < 6; k += 1) {
          anonymous.push({
            gameId: random.pick(GAME_IDS),
            type: 'VIEW',
            clientId: randomUUID(),
            occurredAt: new Date(
              Math.floor((now.getTime() - random.int(1, 14 * 24) * 3600 * 1000) / 1000) * 1000,
            ),
          });
        }
        summary.events += (await tx.gameEvent.createMany({ data: anonymous, skipDuplicates: true })).count;

        // Hạng hiện tại (last_rank) — cùng SQL với RankingService
        const ranks = await rankClass(tx, cls.id);
        for (const row of ranks) {
          await tx.classMembership.updateMany({
            where: { classId: cls.id, studentId: row.studentId, leftAt: null },
            data: { lastRank: row.rank, lastRankAt: now },
          });
        }
      }
    },
    { timeout: 120_000 },
  );

  console.log(
    `[seed] demo: ${summary.teachers} giáo viên, ${summary.classes} lớp, ${summary.students} học sinh, ` +
      `${summary.results} ván, ${summary.points} bút toán GAME, ${summary.bonus} thưởng, ${summary.events} sự kiện`,
  );
  console.log(
    `[seed] demo: mật khẩu chung ${DEMO_PASSWORD} (teacher1@demo.local, k2a.student01@demo.local…)`,
  );
}
