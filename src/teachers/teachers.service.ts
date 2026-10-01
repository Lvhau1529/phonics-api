import { Injectable } from '@nestjs/common';
import {
  AvatarKey,
  type CreateTeacherBody,
  DEFAULT_AVATAR,
  type Paginated,
  type SetTeacherClassesBody,
  type TeacherListQuery,
  type TeacherSummary,
  type UpdateTeacherBody,
} from '@phonics/contracts';
import { AuditService } from '../audit/audit.service';
import { type AuthUser } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { AppError, notFound } from '../common/errors/app-error';
import { orderBy, paginate } from '../common/pagination/paginate';
import { type Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type Tx } from '../prisma/types';

/** Include chuẩn để dựng TeacherSummary: các lớp đang dạy */
const teacherInclude = {
  teachingClasses: {
    select: { class: { select: { id: true, name: true, grade: true, schoolYear: true } } },
    orderBy: [{ class: { schoolYear: 'desc' } }, { class: { name: 'asc' } }],
  },
} satisfies Prisma.UserInclude;

type TeacherRow = Prisma.UserGetPayload<{ include: typeof teacherInclude }>;

const SORT_FIELDS = ['displayName', 'email', 'status', 'createdAt', 'lastLoginAt'] as const;

function toTeacherSummary(row: TeacherRow): TeacherSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarKey: AvatarKey.safeParse(row.avatarKey).data ?? DEFAULT_AVATAR,
    status: row.status,
    provider: row.provider,
    hasPassword: row.passwordHash != null,
    classes: row.teachingClasses.map((t) => t.class),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Quản lý tài khoản giáo viên (chỉ admin) */
@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async list(query: TeacherListQuery): Promise<Paginated<TeacherSummary>> {
    const where: Prisma.UserWhereInput = {
      role: 'TEACHER',
      status: query.status,
      teachingClasses: query.classId ? { some: { classId: query.classId } } : undefined,
      OR: query.q
        ? [
            { displayName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    return paginate(
      query,
      async (args) =>
        (
          await this.prisma.user.findMany({
            where,
            ...args,
            orderBy: [orderBy(query.sort, SORT_FIELDS, { createdAt: 'desc' }), { id: 'asc' }],
            include: teacherInclude,
          })
        ).map(toTeacherSummary),
      () => this.prisma.user.count({ where }),
    );
  }

  /** Không có password → GV đăng nhập Google bằng email này (provider vẫn LOCAL cho tới khi liên kết) */
  async create(actor: AuthUser, body: CreateTeacherBody): Promise<TeacherSummary> {
    await this.assertEmailFree(body.email);
    const classIds = await this.assertClassIds(body.classIds);
    const row = await this.prisma.user.create({
      data: {
        email: body.email,
        displayName: body.displayName,
        avatarKey: body.avatarKey ?? DEFAULT_AVATAR,
        role: 'TEACHER',
        provider: 'LOCAL',
        passwordHash: body.password ? await this.passwords.hash(body.password) : null,
        teachingClasses: { create: classIds.map((classId) => ({ classId })) },
      },
      include: teacherInclude,
    });
    await this.audit.record(actor, 'teacher.create', 'User', row.id, null, {
      email: row.email,
      displayName: row.displayName,
      hasPassword: row.passwordHash != null,
      classIds,
    });
    return toTeacherSummary(row);
  }

  async update(actor: AuthUser, id: string, body: UpdateTeacherBody): Promise<TeacherSummary> {
    const current = await this.findTeacher(id);
    if (body.email && body.email !== current.email) await this.assertEmailFree(body.email, id);

    const row = await this.prisma.user.update({
      where: { id },
      data: {
        email: body.email,
        // Đổi email tay → chưa xác thực lại
        emailVerified: body.email && body.email !== current.email ? false : undefined,
        displayName: body.displayName,
        avatarKey: body.avatarKey,
        status: body.status,
        passwordHash: body.password ? await this.passwords.hash(body.password) : undefined,
      },
      include: teacherInclude,
    });

    // Đổi mật khẩu hoặc khoá tài khoản → mọi phiên phải đăng nhập lại
    if (body.password || (body.status === 'DISABLED' && current.status !== 'DISABLED')) {
      await this.tokens.revokeAll(id);
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of ['email', 'displayName', 'avatarKey', 'status'] as const) {
      if (body[key] !== undefined && body[key] !== current[key]) {
        before[key] = current[key];
        after[key] = row[key];
      }
    }
    if (body.password) after.passwordChanged = true;
    if (Object.keys(after).length)
      await this.audit.record(actor, 'teacher.update', 'User', id, before, after);
    return toTeacherSummary(row);
  }

  /** Thay toàn bộ danh sách lớp giáo viên dạy */
  async setClasses(actor: AuthUser, id: string, body: SetTeacherClassesBody): Promise<TeacherSummary> {
    const current = await this.findTeacher(id);
    const classIds = await this.assertClassIds(body.classIds);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.replaceClasses(tx, id, classIds);
      return tx.user.findUniqueOrThrow({ where: { id }, include: teacherInclude });
    });
    await this.audit.record(
      actor,
      'teacher.setClasses',
      'User',
      id,
      { classIds: current.teachingClasses.map((t) => t.class.id) },
      { classIds },
    );
    return toTeacherSummary(row);
  }

  // ---- helpers ----

  /** Giữ phân công còn trong danh sách (giữ assignedAt), xoá phần thừa, thêm phần mới */
  private async replaceClasses(tx: Tx, teacherId: string, classIds: string[]): Promise<void> {
    await tx.classTeacher.deleteMany({ where: { teacherId, classId: { notIn: classIds } } });
    if (classIds.length) {
      await tx.classTeacher.createMany({
        data: classIds.map((classId) => ({ teacherId, classId })),
        skipDuplicates: true,
      });
    }
  }

  private async findTeacher(id: string): Promise<TeacherRow> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: teacherInclude });
    if (!row || row.role !== 'TEACHER') throw notFound('Không tìm thấy giáo viên');
    return row;
  }

  /** Mọi classId phải tồn tại; trả về danh sách đã khử trùng lặp */
  private async assertClassIds(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return unique;
    const rows = await this.prisma.class.findMany({ where: { id: { in: unique } }, select: { id: true } });
    const found = new Set(rows.map((r) => r.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length) {
      throw new AppError('VALIDATION_ERROR', 400, {
        message: 'Có lớp không tồn tại',
        details: { classIds: missing.map((id) => `Không tìm thấy lớp ${id}`) },
      });
    }
    return unique;
  }

  private async assertEmailFree(email: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.user.findFirst({
      where: { email, NOT: exceptId ? { id: exceptId } : undefined },
      select: { id: true },
    });
    if (taken) throw new AppError('EMAIL_TAKEN', 409, { details: { email: ['Email đã được sử dụng'] } });
  }
}
