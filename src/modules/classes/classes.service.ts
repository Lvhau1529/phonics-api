import { Injectable } from '@nestjs/common';
import {
  AvatarKey,
  type ClassListQuery,
  type ClassSummary,
  type CreateClassBody,
  DEFAULT_AVATAR,
  type Paginated,
  type PublicClassesResponse,
  type SetClassTeachersBody,
  type UpdateClassBody,
} from '@phonics/contracts';
import { AppError, notFound } from '../../common/errors/app-error';
import { orderBy, paginate } from '../../common/utils/paginate';
import { AccessService } from '../../core/access/access.service';
import { PrismaService } from '../../core/database/prisma.service';
import { type Tx } from '../../core/database/types';
import { type Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { type AuthUser } from '../auth/auth.types';

/** Include chuẩn để dựng ClassSummary: giáo viên + số học sinh đang học */
export const classSummaryInclude = {
  teachers: {
    orderBy: { assignedAt: 'asc' },
    select: { teacher: { select: { id: true, displayName: true, email: true, avatarKey: true } } },
  },
  _count: { select: { memberships: { where: { leftAt: null } } } },
} satisfies Prisma.ClassInclude;

type ClassRow = Prisma.ClassGetPayload<{ include: typeof classSummaryInclude }>;

const SORT_FIELDS = ['name', 'grade', 'schoolYear', 'createdAt', 'updatedAt'] as const;

export function toClassSummary(row: ClassRow): ClassSummary {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    schoolYear: row.schoolYear,
    joinVisible: row.joinVisible,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    studentCount: row._count.memberships,
    teachers: row.teachers.map(({ teacher }) => ({
      id: teacher.id,
      displayName: teacher.displayName,
      email: teacher.email,
      avatarKey: AvatarKey.safeParse(teacher.avatarKey).data ?? DEFAULT_AVATAR,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Lớp học: CRUD (admin), phân công giáo viên, danh sách public cho form đăng ký */
@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Lớp đang nhận học sinh (GET /public/classes) */
  async publicList(): Promise<PublicClassesResponse> {
    const rows = await this.prisma.class.findMany({
      where: { joinVisible: true, archivedAt: null },
      orderBy: [{ schoolYear: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, grade: true, schoolYear: true },
    });
    return { items: rows };
  }

  /** ADMIN: mọi lớp theo bộ lọc; TEACHER: chỉ lớp mình dạy */
  async list(user: AuthUser, query: ClassListQuery): Promise<Paginated<ClassSummary>> {
    const where: Prisma.ClassWhereInput = {
      grade: query.grade,
      schoolYear: query.schoolYear,
      // Mặc định chỉ lớp đang hoạt động
      archivedAt: query.archived ? { not: null } : null,
      name: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
      id: user.role === 'TEACHER' ? { in: await this.access.teacherClassIds(user.id) } : undefined,
    };
    const sort = orderBy(query.sort, SORT_FIELDS, { schoolYear: 'desc' });
    return paginate(
      query,
      async (args) =>
        (
          await this.prisma.class.findMany({
            where,
            ...args,
            orderBy: [sort, { name: 'asc' }],
            include: classSummaryInclude,
          })
        ).map(toClassSummary),
      () => this.prisma.class.count({ where }),
    );
  }

  /** Một lớp (TEACHER phải là giáo viên của lớp) */
  async get(user: AuthUser, id: string): Promise<ClassSummary> {
    const row = await this.prisma.class.findUnique({ where: { id }, include: classSummaryInclude });
    if (!row) throw notFound('Không tìm thấy lớp');
    await this.access.assertClassAccess(user, id);
    return toClassSummary(row);
  }

  async create(actor: AuthUser, body: CreateClassBody): Promise<ClassSummary> {
    const teacherIds = await this.assertTeacherIds(body.teacherIds);
    await this.assertNameFree(body.name, body.schoolYear);
    const row = await this.prisma.class.create({
      data: {
        name: body.name,
        grade: body.grade,
        schoolYear: body.schoolYear,
        joinVisible: body.joinVisible,
        teachers: { create: teacherIds.map((teacherId) => ({ teacherId })) },
      },
      include: classSummaryInclude,
    });
    const view = toClassSummary(row);
    await this.audit.record(actor, 'class.create', 'Class', row.id, null, {
      name: view.name,
      grade: view.grade,
      schoolYear: view.schoolYear,
      joinVisible: view.joinVisible,
      teacherIds,
    });
    return view;
  }

  /** Sửa thông tin / lưu trữ (archived: true → archivedAt = now, false → mở lại) */
  async update(actor: AuthUser, id: string, body: UpdateClassBody): Promise<ClassSummary> {
    const current = await this.prisma.class.findUnique({ where: { id } });
    if (!current) throw notFound('Không tìm thấy lớp');

    const name = body.name ?? current.name;
    const schoolYear = body.schoolYear ?? current.schoolYear;
    if (name !== current.name || schoolYear !== current.schoolYear)
      await this.assertNameFree(name, schoolYear, id);

    let archivedAt: Date | null | undefined;
    if (body.archived === true) archivedAt = current.archivedAt ?? new Date();
    else if (body.archived === false) archivedAt = null;

    const row = await this.prisma.class.update({
      where: { id },
      data: {
        name: body.name,
        grade: body.grade,
        schoolYear: body.schoolYear,
        joinVisible: body.joinVisible,
        archivedAt,
      },
      include: classSummaryInclude,
    });

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of ['name', 'grade', 'schoolYear', 'joinVisible'] as const) {
      if (body[key] !== undefined && body[key] !== current[key]) {
        before[key] = current[key];
        after[key] = row[key];
      }
    }
    if (
      archivedAt !== undefined &&
      (current.archivedAt?.getTime() ?? null) !== (row.archivedAt?.getTime() ?? null)
    ) {
      before.archivedAt = current.archivedAt?.toISOString() ?? null;
      after.archivedAt = row.archivedAt?.toISOString() ?? null;
    }
    if (Object.keys(after).length) await this.audit.record(actor, 'class.update', 'Class', id, before, after);
    return toClassSummary(row);
  }

  /** DELETE = lưu trữ (không xoá dữ liệu) */
  async archive(actor: AuthUser, id: string): Promise<void> {
    await this.update(actor, id, { archived: true });
  }

  /** Thay toàn bộ danh sách giáo viên của lớp */
  async setTeachers(actor: AuthUser, id: string, body: SetClassTeachersBody): Promise<ClassSummary> {
    const current = await this.prisma.class.findUnique({
      where: { id },
      select: { teachers: { select: { teacherId: true }, orderBy: { assignedAt: 'asc' } } },
    });
    if (!current) throw notFound('Không tìm thấy lớp');
    const teacherIds = await this.assertTeacherIds(body.teacherIds);

    const row = await this.prisma.$transaction(async (tx) => {
      await this.replaceTeachers(tx, id, teacherIds);
      return tx.class.findUniqueOrThrow({ where: { id }, include: classSummaryInclude });
    });
    await this.audit.record(
      actor,
      'class.setTeachers',
      'Class',
      id,
      { teacherIds: current.teachers.map((t) => t.teacherId) },
      { teacherIds },
    );
    return toClassSummary(row);
  }

  /** Giữ những phân công còn trong danh sách (giữ assignedAt), xoá phần thừa, thêm phần mới */
  private async replaceTeachers(tx: Tx, classId: string, teacherIds: string[]): Promise<void> {
    await tx.classTeacher.deleteMany({ where: { classId, teacherId: { notIn: teacherIds } } });
    if (teacherIds.length) {
      await tx.classTeacher.createMany({
        data: teacherIds.map((teacherId) => ({ classId, teacherId })),
        skipDuplicates: true,
      });
    }
  }

  /** Mọi id phải là user role TEACHER; trả về danh sách đã khử trùng lặp */
  private async assertTeacherIds(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return unique;
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique }, role: 'TEACHER' },
      select: { id: true },
    });
    const found = new Set(rows.map((r) => r.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length) {
      throw new AppError('VALIDATION_ERROR', 400, {
        message: 'Có id không phải giáo viên',
        details: { teacherIds: missing.map((id) => `${id} không phải giáo viên`) },
      });
    }
    return unique;
  }

  /** (name, schoolYear) là unique */
  private async assertNameFree(name: string, schoolYear: string, exceptId?: string): Promise<void> {
    const dup = await this.prisma.class.findFirst({
      where: { name, schoolYear, NOT: exceptId ? { id: exceptId } : undefined },
      select: { id: true },
    });
    if (dup) {
      throw new AppError('CONFLICT', 409, {
        message: 'Lớp cùng tên đã tồn tại trong năm học này',
        details: { name: ['Lớp cùng tên đã tồn tại trong năm học này'] },
      });
    }
  }
}
