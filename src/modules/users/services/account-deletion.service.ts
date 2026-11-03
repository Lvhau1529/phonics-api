import { Injectable } from '@nestjs/common';
import { type DeleteBlocker, type DeleteImpactKey, type DeletePreview } from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { TimeService } from '@/core/time/time.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { AccountDeletionRepository } from '@/modules/users/repositories/account-deletion.repository';

type Impact = Partial<Record<DeleteImpactKey, number>>;

/** Gom preview: chỉ giữ dòng ảnh hưởng > 0 */
export function toPreview(impact: Impact, blockers: DeleteBlocker[]): DeletePreview {
  return {
    canDelete: blockers.length === 0,
    blockers,
    impact: (Object.entries(impact) as [DeleteImpactKey, number][])
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ key, count })),
  };
}

/**
 * Xoá mềm học sinh / giáo viên / phụ huynh tạo nhầm (chỉ admin): đánh dấu `deletedAt`, khoá đăng nhập, ẩn khỏi
 * danh sách, gỡ liên kết đang hiệu lực. Điểm, bài làm, điểm danh, học phí, nội dung GV soạn giữ nguyên trong DB;
 * email gốc + liên kết đã gỡ lưu ở `deletedSnapshot` (và audit) để khôi phục khi cần.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly repo: AccountDeletionRepository,
    private readonly audit: AuditService,
    private readonly time: TimeService,
  ) {}

  async studentPreview(id: string): Promise<DeletePreview> {
    await this.assertRole(id, 'STUDENT', 'studentNotFound');
    const links = await this.repo.studentLinks(id, this.today());
    return toPreview(
      {
        classes: links.memberships.length,
        guardians: links.guardians.length,
        slotAssignments: links.assignments.length,
      },
      [],
    );
  }

  async deleteStudent(actor: AuthUser, id: string): Promise<void> {
    const user = await this.assertRole(id, 'STUDENT', 'studentNotFound');
    const at = new Date();
    const today = this.today();
    const links = await this.repo.studentLinks(id, today);
    const snapshot = { ...identity(user), ...links };
    await this.repo.transaction(async (tx) => {
      await this.repo.detachStudent(tx, id, at, today);
      await this.repo.softDeleteUser(tx, id, { at, byId: actor.id, snapshot });
    });
    await this.audit.record(
      actor,
      'student.delete',
      'User',
      id,
      { displayName: user.displayName, ...snapshot },
      {
        deletedAt: at.toISOString(),
      },
    );
  }

  async teacherPreview(id: string): Promise<DeletePreview> {
    await this.assertRole(id, 'TEACHER', 'teacherNotFound');
    const links = await this.repo.teacherLinks(id);
    return toPreview({ classes: links.classIds.length, extraSlots: links.slotIds.length }, []);
  }

  /** Câu hỏi / phiếu bài / bài giao / media GV soạn vẫn giữ (người tạo là tài khoản đã xoá) */
  async deleteTeacher(actor: AuthUser, id: string): Promise<void> {
    const user = await this.assertRole(id, 'TEACHER', 'teacherNotFound');
    const at = new Date();
    const snapshot = { ...identity(user), ...(await this.repo.teacherLinks(id)) };
    await this.repo.transaction(async (tx) => {
      await this.repo.detachTeacher(tx, id);
      await this.repo.softDeleteUser(tx, id, { at, byId: actor.id, snapshot });
    });
    await this.audit.record(
      actor,
      'teacher.delete',
      'User',
      id,
      { displayName: user.displayName, ...snapshot },
      {
        deletedAt: at.toISOString(),
      },
    );
  }

  async guardianPreview(id: string): Promise<DeletePreview> {
    const guardian = await this.repo.findGuardian(id);
    if (!guardian) throw notFound('guardianNotFound');
    return toPreview(
      {
        children: (await this.repo.guardianLinks(id)).length,
        familyAccount: guardian.user?.role === 'PARENT' ? 1 : 0,
      },
      [],
    );
  }

  /** Xoá mềm phụ huynh + gỡ liên kết với bé + khoá tài khoản gia đình (role PARENT); các bé giữ nguyên */
  async deleteGuardian(actor: AuthUser, id: string): Promise<void> {
    const guardian = await this.repo.findGuardian(id);
    if (!guardian) throw notFound('guardianNotFound');
    const at = new Date();
    const parent =
      guardian.user?.role === 'PARENT' && guardian.userId ? { id: guardian.userId, ...guardian.user } : null;
    const snapshot = { email: guardian.email, students: await this.repo.guardianLinks(id) };
    await this.repo.transaction(async (tx) => {
      await this.repo.softDeleteGuardian(tx, id, { at, byId: actor.id, snapshot });
      if (!parent) return;
      await this.repo.revokeActorSessions(tx, parent.id, at);
      await this.repo.softDeleteUser(tx, parent.id, { at, byId: actor.id, snapshot: identity(parent) });
    });
    await this.audit.record(
      actor,
      'guardian.delete',
      'Guardian',
      id,
      { fullName: guardian.fullName, phone: guardian.phone, userId: guardian.userId, ...snapshot },
      { deletedAt: at.toISOString() },
    );
  }

  private today(): string {
    return this.time.toIsoDate(new Date());
  }

  private async assertRole(
    id: string,
    role: 'STUDENT' | 'TEACHER',
    missing: 'studentNotFound' | 'teacherNotFound',
  ) {
    const user = await this.repo.findUser(id);
    if (!user || user.role !== role) throw notFound(missing);
    return user;
  }
}

/** Thông tin đăng nhập gốc (cột chính bị đặt null khi xoá) */
function identity(user: { email: string | null; googleSub: string | null; status: string }) {
  return { email: user.email, googleSub: user.googleSub, status: user.status };
}
