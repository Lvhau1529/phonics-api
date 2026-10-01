import { Injectable } from '@nestjs/common';
import {
  AvatarKey,
  DEFAULT_AVATAR,
  type GameResultListQuery,
  type GameResultView,
  type MoveClassBody,
  type Paginated,
  type ParentContact,
  type PointEntryView,
  type PointsByGame,
  type PointsListQuery,
  type RangeQuery,
  type ResetPasswordBody,
  type StudentDetail,
  type StudentListQuery,
  type StudentSummary,
  type UpdateStudentBody,
} from '@phonics/contracts';
import { AppError, notFound } from '../../common/errors/app-error';
import { orderBy, paginate } from '../../common/utils/paginate';
import { AccessService } from '../../core/access/access.service';
import { PrismaService } from '../../core/database/prisma.service';
import { TimeService } from '../../core/time/time.service';
import { type GameResult, type Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { type AuthUser } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PointsService } from '../points/points.service';
import { RankingService } from '../points/ranking.service';

/** Include chuẩn để dựng StudentSummary / StudentDetail: profile + lớp đang học */
const studentInclude = {
  studentProfile: {
    select: {
      parentName: true,
      parentEmail: true,
      parentPhone: true,
      notes: true,
      memberships: {
        where: { leftAt: null },
        take: 1,
        select: {
          joinedAt: true,
          class: { select: { id: true, name: true, grade: true, schoolYear: true } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

type StudentRow = Prisma.UserGetPayload<{ include: typeof studentInclude }>;

const SORT_FIELDS = ['displayName', 'email', 'status', 'createdAt', 'lastLoginAt'] as const;
const RESULT_SORT_FIELDS = ['playedAt', 'createdAt', 'score', 'correct'] as const;

/** Trường giáo viên (có students.edit) được sửa; còn lại chỉ admin */
const TEACHER_EDITABLE_FIELDS: readonly (keyof UpdateStudentBody)[] = ['displayName', 'avatarKey'];

function toGameResultView(row: GameResult): GameResultView {
  return {
    id: row.id,
    studentId: row.studentId,
    classId: row.classId,
    gameId: row.gameId as GameResultView['gameId'],
    mode: 'solo',
    levelId: row.levelId,
    packId: row.packId,
    correct: row.correct,
    total: row.total,
    score: row.score,
    durationMs: row.durationMs,
    endedBy: row.endedBy as GameResultView['endedBy'],
    playedAt: row.playedAt.toISOString(),
    pointsAwarded: row.pointsAwarded,
    details: (row.details as Record<string, unknown> | null) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

/** Liên hệ phụ huynh từ profile (chỉ giữ trường có dữ liệu) */
function toParentContact(profile: StudentRow['studentProfile']): ParentContact {
  const parent: ParentContact = {};
  if (profile?.parentName) parent.name = profile.parentName;
  if (profile?.parentEmail) parent.email = profile.parentEmail;
  if (profile?.parentPhone) parent.phone = profile.parentPhone;
  return parent;
}

/** Học sinh: danh sách / chi tiết (ADMIN mọi lớp, TEACHER lớp mình), sửa, đổi lớp, đặt lại mật khẩu */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly points: PointsService,
    private readonly ranking: RankingService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly time: TimeService,
  ) {}

  /** ADMIN không có classId → mọi học sinh (kể cả chưa vào lớp); TEACHER → học sinh các lớp mình dạy */
  async list(user: AuthUser, query: StudentListQuery): Promise<Paginated<StudentSummary>> {
    const classIds = await this.access.scopedClassIds(user, query.classId);
    const where: Prisma.UserWhereInput = {
      role: 'STUDENT',
      status: query.status,
      OR: query.q
        ? [
            { displayName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
      studentProfile: classIds
        ? { memberships: { some: { leftAt: null, classId: { in: classIds } } } }
        : undefined,
    };
    return paginate(
      query,
      async (args) =>
        this.toSummaries(
          await this.prisma.user.findMany({
            where,
            ...args,
            orderBy: [orderBy(query.sort, SORT_FIELDS, { createdAt: 'desc' }), { id: 'asc' }],
            include: studentInclude,
          }),
        ),
      () => this.prisma.user.count({ where }),
    );
  }

  async detail(user: AuthUser, id: string): Promise<StudentDetail> {
    const row = await this.findStudent(id);
    await this.access.assertStudentAccess(user, id);
    return this.toDetail(user, row);
  }

  /** ADMIN: mọi trường; TEACHER (students.edit): chỉ displayName / avatarKey */
  async update(actor: AuthUser, id: string, body: UpdateStudentBody): Promise<StudentDetail> {
    const current = await this.findStudent(id);
    await this.access.assertStudentAccess(actor, id);

    const keys = (Object.keys(body) as (keyof UpdateStudentBody)[]).filter((k) => body[k] !== undefined);
    if (actor.role !== 'ADMIN') {
      const denied = keys.filter((k) => !TEACHER_EDITABLE_FIELDS.includes(k));
      if (denied.length) {
        throw new AppError('FORBIDDEN_PERMISSION', 403, {
          message: 'Giáo viên chỉ được sửa tên hiển thị và avatar',
          details: { fields: denied.map(String) },
        });
      }
    }
    if (body.email && body.email !== current.email) await this.assertEmailFree(body.email, id);

    const profileData: Prisma.StudentProfileUpdateInput = {};
    if (body.parent !== undefined) {
      profileData.parentName = body.parent?.name ?? null;
      profileData.parentEmail = body.parent?.email ?? null;
      profileData.parentPhone = body.parent?.phone ?? null;
    }
    if (body.notes !== undefined) profileData.notes = body.notes;
    const touchesProfile = Object.keys(profileData).length > 0;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        displayName: body.displayName,
        avatarKey: body.avatarKey,
        email: body.email,
        // Admin đổi email tay → chưa xác thực lại
        emailVerified: body.email && body.email !== current.email ? false : undefined,
        status: body.status,
        studentProfile: touchesProfile
          ? {
              upsert: {
                create: profileData as Prisma.StudentProfileCreateWithoutUserInput,
                update: profileData,
              },
            }
          : undefined,
      },
      include: studentInclude,
    });

    // Vô hiệu phiên đang đăng nhập khi khoá tài khoản
    if (body.status === 'DISABLED' && current.status !== 'DISABLED') await this.tokens.revokeAll(id);

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of ['displayName', 'avatarKey', 'email', 'status'] as const) {
      if (body[key] !== undefined && body[key] !== current[key]) {
        before[key] = current[key];
        after[key] = updated[key];
      }
    }
    if (body.parent !== undefined) {
      before.parent = toParentContact(current.studentProfile);
      after.parent = toParentContact(updated.studentProfile);
    }
    if (body.notes !== undefined && body.notes !== (current.studentProfile?.notes ?? null)) {
      before.notes = current.studentProfile?.notes ?? null;
      after.notes = updated.studentProfile?.notes ?? null;
    }
    if (Object.keys(after).length)
      await this.audit.record(actor, 'student.update', 'User', id, before, after);

    return this.toDetail(actor, updated);
  }

  /** Chuyển lớp: đóng membership cũ, mở membership mới, tính lại hạng hai lớp, báo cho học sinh */
  async moveClass(actor: AuthUser, id: string, body: MoveClassBody): Promise<StudentDetail> {
    const student = await this.findStudent(id);
    const current = student.studentProfile?.memberships[0]?.class ?? null;
    if (current?.id === body.classId) {
      throw new AppError('CONFLICT', 409, { message: 'Học sinh đang ở lớp này rồi' });
    }
    const target = await this.prisma.class.findUnique({
      where: { id: body.classId },
      select: { id: true, name: true, grade: true, archivedAt: true },
    });
    if (!target) throw notFound('Không tìm thấy lớp');
    if (target.archivedAt) {
      throw new AppError('CLASS_NOT_JOINABLE', 400, { details: { classId: ['Lớp đã lưu trữ'] } });
    }
    // TEACHER phải dạy cả lớp cũ (nếu có) lẫn lớp mới; ADMIN luôn qua
    if (current) await this.access.assertClassAccess(actor, current.id);
    await this.access.assertClassAccess(actor, target.id);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.classMembership.updateMany({ where: { studentId: id, leftAt: null }, data: { leftAt: now } });
      await tx.classMembership.create({ data: { studentId: id, classId: target.id, joinedAt: now } });
      if (current) await this.ranking.recomputeAndNotify(tx, current.id);
      await this.ranking.recomputeAndNotify(tx, target.id, id);
      await this.notifications.create(
        {
          userId: id,
          type: 'CLASS_CHANGED',
          title: `You joined ${target.name}`,
          body: `You are now in ${target.name} (${target.grade}). Keep playing to climb the ranking!`,
          data: { classId: target.id, previousClassId: current?.id ?? null, byUserId: actor.id },
        },
        tx,
      );
    });

    await this.audit.record(
      actor,
      'student.moveClass',
      'User',
      id,
      { classId: current?.id ?? null },
      { classId: target.id, note: body.note ?? null },
    );
    return this.detail(actor, id);
  }

  /** Admin đặt lại mật khẩu: băm mới + đăng xuất mọi thiết bị */
  async resetPassword(actor: AuthUser, id: string, body: ResetPasswordBody): Promise<void> {
    await this.findStudent(id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await this.passwords.hash(body.newPassword) },
    });
    await this.tokens.revokeAll(id);
    await this.audit.record(actor, 'student.resetPassword', 'User', id, null, null);
  }

  /** Sổ điểm của học sinh (đã kiểm tra scope) */
  async pointsList(
    user: AuthUser,
    id: string,
    query: Omit<PointsListQuery, 'studentId'>,
  ): Promise<Paginated<PointEntryView>> {
    await this.assertStudent(user, id);
    return this.points.list({ ...query, studentId: id });
  }

  async pointsByGame(user: AuthUser, id: string, query: RangeQuery): Promise<{ items: PointsByGame[] }> {
    await this.assertStudent(user, id);
    const totals = await this.points.totals(id, this.time.resolveRange(query));
    return { items: totals.byGame };
  }

  async gameResults(
    user: AuthUser,
    id: string,
    query: GameResultListQuery,
  ): Promise<Paginated<GameResultView>> {
    await this.assertStudent(user, id);
    const where: Prisma.GameResultWhereInput = { studentId: id, gameId: query.gameId };
    return paginate(
      query,
      async (args) =>
        (
          await this.prisma.gameResult.findMany({
            where,
            ...args,
            orderBy: [orderBy(query.sort, RESULT_SORT_FIELDS, { playedAt: 'desc' }), { id: 'asc' }],
          })
        ).map(toGameResultView),
      () => this.prisma.gameResult.count({ where }),
    );
  }

  // ---- helpers ----

  /** Tổng điểm (một groupBy cho cả trang) + hạng trong lớp (rankClass cho từng lớp xuất hiện ở trang) */
  async toSummaries(rows: StudentRow[]): Promise<StudentSummary[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const classIds = [
      ...new Set(rows.flatMap((r) => r.studentProfile?.memberships.map((m) => m.class.id) ?? [])),
    ];

    const [sums, ranks] = await Promise.all([
      this.prisma.pointEntry.groupBy({
        by: ['studentId'],
        where: { studentId: { in: ids } },
        _sum: { points: true },
      }),
      Promise.all(classIds.map((classId) => this.ranking.rankClass(this.prisma, classId))),
    ]);
    const pointsById = new Map(sums.map((s) => [s.studentId, s._sum.points ?? 0]));
    // Mỗi học sinh chỉ có một membership đang hoạt động nên map phẳng theo studentId là đủ
    const rankById = new Map(ranks.flat().map((r) => [r.studentId, r.rank]));

    return rows.map((row) => {
      const membership = row.studentProfile?.memberships[0];
      return {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        avatarKey: AvatarKey.safeParse(row.avatarKey).data ?? DEFAULT_AVATAR,
        status: row.status,
        class: membership ? { ...membership.class, joinedAt: membership.joinedAt.toISOString() } : null,
        points: pointsById.get(row.id) ?? 0,
        rank: membership ? (rankById.get(row.id) ?? null) : null,
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  private async toDetail(viewer: AuthUser, row: StudentRow): Promise<StudentDetail> {
    const [[summary], totals, gamesPlayed, canSeeParent] = await Promise.all([
      this.toSummaries([row]),
      this.points.totals(row.id, null),
      this.prisma.gameResult.count({ where: { studentId: row.id } }),
      this.canViewParent(viewer),
    ]);
    return {
      ...summary,
      parent: canSeeParent ? toParentContact(row.studentProfile) : null,
      notes: viewer.role === 'ADMIN' ? (row.studentProfile?.notes ?? null) : null,
      pointsByKind: totals.byKind,
      gamesPlayed,
    };
  }

  private async canViewParent(viewer: AuthUser): Promise<boolean> {
    if (viewer.role === 'ADMIN') return true;
    if (viewer.role !== 'TEACHER') return false;
    return (await this.permissions.effectiveFor(viewer)).has('students.viewParentContact');
  }

  private async findStudent(id: string): Promise<StudentRow> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: studentInclude });
    if (!row || row.role !== 'STUDENT') throw notFound('Không tìm thấy học sinh');
    return row;
  }

  /** Tồn tại + trong phạm vi của người gọi */
  private async assertStudent(user: AuthUser, id: string): Promise<void> {
    await this.findStudent(id);
    await this.access.assertStudentAccess(user, id);
  }

  private async assertEmailFree(email: string, exceptId: string): Promise<void> {
    const taken = await this.prisma.user.findFirst({
      where: { email, NOT: { id: exceptId } },
      select: { id: true },
    });
    if (taken) throw new AppError('EMAIL_TAKEN', 409, { details: { email: ['Email đã được sử dụng'] } });
  }
}
