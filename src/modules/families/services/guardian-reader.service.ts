import { Injectable } from '@nestjs/common';
import {
  type GuardianListQuery,
  type GuardianSummary,
  type Paginated,
  type StudentGuardiansResponse,
  type StudentGuardianView,
} from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { orderBy, paginate } from '@/common/utils/paginate';
import { foldName } from '@/common/utils/student-names';
import { AccessService } from '@/core/access/access.service';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toGuardianSummary, toStudentGuardianView } from '@/modules/families/dto/responses/family.view';
import { GuardianRepository } from '@/modules/families/repositories/guardian.repository';
import { GUARDIAN_SORT_FIELDS } from '@/modules/families/types/family.types';
import { PermissionsService } from '@/modules/permissions/services/permissions.service';

/** Đọc phụ huynh: danh sách / chi tiết (admin), phụ huynh của một học sinh (admin + GV có quyền xem liên hệ) */
@Injectable()
export class GuardianReaderService {
  constructor(
    private readonly repo: GuardianRepository,
    private readonly access: AccessService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Tìm theo tên phụ huynh, email, SĐT hoặc tên con (không dấu) */
  async list(query: GuardianListQuery): Promise<Paginated<GuardianSummary>> {
    const q = query.q;
    const digits = q?.replace(/\D/g, '');
    const where: Prisma.GuardianWhereInput = {
      userId: query.hasAccount ? (query.hasAccount === 'true' ? { not: null } : null) : undefined,
      OR: q
        ? [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            ...(digits && digits.length >= 3 ? [{ phone: { contains: digits.replace(/^0/, '') } }] : []),
            { students: { some: { student: { nameSearch: { contains: foldName(q) } } } } },
          ]
        : undefined,
    };
    const sort = [orderBy(query.sort, GUARDIAN_SORT_FIELDS, { createdAt: 'desc' }), { id: 'asc' as const }];
    return paginate(
      query,
      async (page) => (await this.repo.findPage(where, page, sort)).map(toGuardianSummary),
      () => this.repo.count(where),
    );
  }

  async detail(id: string): Promise<GuardianSummary> {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('guardianNotFound');
    return toGuardianSummary(row);
  }

  /** GET students/:id/guardians — GV: học sinh lớp mình + quyền students.viewParentContact */
  async ofStudent(user: AuthUser, studentId: string): Promise<StudentGuardiansResponse> {
    await this.assertStudent(studentId);
    await this.access.assertStudentAccess(user, studentId);
    if (!(await this.canViewContacts(user))) return { items: [] };
    return { items: await this.forStudent(studentId) };
  }

  /** Phụ huynh của học sinh (đã kiểm tra quyền ở caller) — dùng cho trang chi tiết học sinh */
  async forStudent(studentId: string): Promise<StudentGuardianView[]> {
    return (await this.repo.studentLinks(studentId)).map(toStudentGuardianView);
  }

  async assertStudent(id: string): Promise<void> {
    if (!(await this.repo.isStudent(id))) throw notFound('studentNotFound');
  }

  async canViewContacts(viewer: AuthUser): Promise<boolean> {
    if (viewer.role === 'ADMIN') return true;
    if (viewer.role !== 'TEACHER') return false;
    return (await this.permissions.effectiveFor(viewer)).has('students.viewParentContact');
  }
}
