/**
 * Seed (prisma db seed → `tsx prisma/seed.ts`). Không dùng Nest: PrismaClient + adapter pg trực tiếp.
 *
 * Luôn chạy (idempotent):
 *   - ADMIN từ ADMIN_EMAIL / ADMIN_PASSWORD (không ghi đè mật khẩu admin đã có, trừ khi SEED_RESET_ADMIN_PASSWORD=true)
 *   - catalog `games` từ contracts GAME_IDS
 * Khi SEED_DEMO=true và NODE_ENV !== 'production': 2 giáo viên, 3 lớp, 24 học sinh, kết quả chơi 14 ngày,
 * điểm thưởng, sự kiện xem / chơi, hạng hiện tại. Bỏ qua nếu đã có teacher1@demo.local.
 * Tài khoản demo: xem apps/api/README.md.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { AVATARS, GAME_IDS, type GameId } from '@phonics/contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { type Prisma, PrismaClient } from '../src/generated/prisma/client';

const GAME_TITLES: Record<GameId, string> = {
  'bread-catcher': 'Bread Catcher',
  'food-stream': 'Food Stream',
};
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_TEACHER1 = 'teacher1@demo.local';
const DEMO_TEACHER2 = 'teacher2@demo.local';
const SCHOOL_YEAR = '2026-2027';
const DAY_MS = 24 * 3600 * 1000;

const STUDENT_NAMES = [
  'Lily',
  'Max',
  'Mia',
  'Leo',
  'Zoe',
  'Sam',
  'Ella',
  'Ben',
  'Ava',
  'Noah',
  'Ruby',
  'Finn',
  'Ivy',
  'Jack',
  'Luna',
  'Theo',
  'Nora',
  'Owen',
  'Rosie',
  'Eli',
  'Daisy',
  'Kai',
  'Poppy',
  'Milo',
];

/** Cùng tham số với src/auth/password.service.ts */
const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/** PRNG có seed (mulberry32) để dữ liệu demo lặp lại được giữa các lần chạy */
function createRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Số nguyên trong [min, max] */
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
  };
}

function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Thiếu DIRECT_URL / DATABASE_URL trong .env');
  return url;
}

async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Thiếu ADMIN_EMAIL / ADMIN_PASSWORD trong .env');

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        emailVerified: true,
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
        displayName: 'Admin',
      },
    });
    console.log(`[seed] admin: tạo mới ${email}`);
    return;
  }
  if (process.env.SEED_RESET_ADMIN_PASSWORD === 'true') {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } },
    });
    console.log(`[seed] admin: đã đặt lại mật khẩu ${email} (SEED_RESET_ADMIN_PASSWORD=true)`);
    return;
  }
  console.log(`[seed] admin: ${email} đã tồn tại (giữ nguyên mật khẩu)`);
}

/** Catalog game: chỉ tạo khi thiếu — không ghi đè title / enabled / price admin đã chỉnh */
async function seedGames(prisma: PrismaClient): Promise<void> {
  for (const [index, id] of GAME_IDS.entries()) {
    await prisma.game.upsert({
      where: { id },
      update: {},
      create: { id, title: GAME_TITLES[id], enabled: true, price: null, sortOrder: index },
    });
  }
  console.log(`[seed] games: ${GAME_IDS.join(', ')}`);
}

/** Nhóm quyền mẫu (hệ thống): admin có thể sửa quyền, không xoá được */
async function seedPermissionGroups(prisma: PrismaClient): Promise<void> {
  const groups = [
    {
      name: 'Giáo viên chủ nhiệm',
      description: 'Được chuyển lớp học sinh, xem liên hệ phụ huynh và mở khoá game cho lớp mình',
      permissions: ['class.changeStudentClass', 'students.viewParentContact', 'games.unlock'],
    },
    {
      name: 'Quản lý game',
      description: 'Sửa catalog game và mở khoá game',
      permissions: ['games.manage', 'games.unlock'],
    },
  ];
  for (const g of groups) {
    await prisma.permissionGroup.upsert({
      where: { name: g.name },
      update: {},
      create: { ...g, isSystem: true },
    });
  }
  console.log(`[seed] permission groups: ${groups.map((g) => g.name).join(', ')}`);
}

/** SQL xếp hạng — bản sao của src/points/ranking.service.ts (rankClass, không lọc thời gian / game) */
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

async function seedDemo(prisma: PrismaClient): Promise<void> {
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
            data: { ...t, emailVerified: true, passwordHash, role: 'TEACHER', avatarKey: 'pip' },
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
            const total = gameId === 'bread-catcher' ? 5 : random.int(8, 12);
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

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString(), max: 3 }),
  });
  try {
    await seedAdmin(prisma);
    await seedGames(prisma);
    await seedPermissionGroups(prisma);
    if (process.env.SEED_DEMO === 'true') {
      if (process.env.NODE_ENV === 'production') console.log('[seed] demo: bỏ qua vì NODE_ENV=production');
      else await seedDemo(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] lỗi:', error);
  process.exitCode = 1;
});
