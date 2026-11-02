import { Injectable } from '@nestjs/common';
import {
  type Paginated,
  type StudentDetail,
  type StudentListQuery,
  type StudentSummary,
} from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { orderBy, paginate } from '@/common/utils/paginate';
import { foldName } from '@/common/utils/student-names';
import { AccessService } from '@/core/access/access.service';
import { PrismaService } from '@/database/prisma.service';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { GuardianReaderService } from '@/modules/families/services/guardian-reader.service';
import { PointReaderService } from '@/modules/points/services/point-reader.service';
import { RankingService } from '@/modules/points/services/ranking.service';
import { toParentContact, toStudentSummary } from '@/modules/students/dto/responses/student.view';
import { StudentRepository } from '@/modules/students/repositories/student.repository';
import { STUDENT_SORT_FIELDS, studentOrderBy, type StudentRow } from '@/modules/students/types/student.types';

/** Đọc học sinh: danh sách / chi tiết (ADMIN mọi lớp, TEACHER lớp mình) */
@Injectable()
export class StudentReaderService {
  constructor(
    private readonly repo: StudentRepository,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly points: PointReaderService,
    private readonly ranking: RankingService,
    private readonly guardians: GuardianReaderService,
  ) {}

  /** ADMIN không có classId → mọi học sinh (kể cả chưa vào lớp); TEACHER → học sinh các lớp mình dạy */
  async list(user: AuthUser, query: StudentListQuery): Promise<Paginated<StudentSummary>> {
    const classIds = await this.access.scopedClassIds(user, query.classId);
    const where: Prisma.UserWhereInput = {
      role: 'STUDENT',
      status: query.status,
      loginMode: query.loginMode,
      // Tìm không dấu theo tên tiếng Việt + tiếng Anh ("nguyen an" ra "Nguyễn Văn An"), hoặc theo email
      OR: query.q
        ? [
            { studentProfile: { nameSearch: { contains: foldName(query.q) } } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
      studentProfile: classIds
        ? { memberships: { some: { leftAt: null, classId: { in: classIds } } } }
        : undefined,
    };
    const sort = [
      studentOrderBy(orderBy(query.sort, STUDENT_SORT_FIELDS, { createdAt: 'desc' })),
      { id: 'asc' as const },
    ];
    return paginate(
      query,
      async (page) => this.toSummaries(await this.repo.findPage(where, page, sort)),
      () => this.repo.count(where),
    );
  }

  async detail(user: AuthUser, id: string): Promise<StudentDetail> {
    const row = await this.findStudent(id);
    await this.access.assertStudentAccess(user, id);
    return this.toDetail(user, row);
  }

  async findStudent(id: string): Promise<StudentRow> {
    const row = await this.repo.findById(id);
    if (!row || row.role !== 'STUDENT') throw notFound('studentNotFound');
    return row;
  }

  /** Tồn tại + trong phạm vi của người gọi */
  async assertStudent(user: AuthUser, id: string): Promise<void> {
    await this.findStudent(id);
    await this.access.assertStudentAccess(user, id);
  }

  /** Tổng điểm (một groupBy cho cả trang) + hạng trong lớp (rankClass cho từng lớp xuất hiện ở trang) */
  async toSummaries(rows: StudentRow[]): Promise<StudentSummary[]> {
    if (!rows.length) return [];
    const classIds = [
      ...new Set(rows.flatMap((r) => r.studentProfile?.memberships.map((m) => m.class.id) ?? [])),
    ];
    const [pointsById, ranks] = await Promise.all([
      this.repo.totalPoints(rows.map((r) => r.id)),
      Promise.all(classIds.map((classId) => this.ranking.rankClass(this.prisma, classId))),
    ]);
    // Mỗi học sinh chỉ có một membership đang hoạt động nên map phẳng theo studentId là đủ
    const rankById = new Map(ranks.flat().map((r) => [r.studentId, r.rank]));
    return rows.map((row) =>
      toStudentSummary(row, pointsById.get(row.id) ?? 0, rankById.get(row.id) ?? null),
    );
  }

  /** Chi tiết: phụ huynh chỉ khi được phép xem liên hệ, ghi chú chỉ ADMIN */
  async toDetail(viewer: AuthUser, row: StudentRow): Promise<StudentDetail> {
    const [[summary], totals, gamesPlayed, canSeeParent] = await Promise.all([
      this.toSummaries([row]),
      this.points.totals(row.id, null),
      this.repo.countGameResults({ studentId: row.id }),
      this.guardians.canViewContacts(viewer),
    ]);
    const guardians = canSeeParent ? await this.guardians.forStudent(row.id) : null;
    return {
      ...summary,
      parent: guardians ? toParentContact(guardians) : null,
      guardians,
      notes: viewer.role === 'ADMIN' ? (row.studentProfile?.notes ?? null) : null,
      pointsByKind: totals.byKind,
      gamesPlayed,
    };
  }
}
