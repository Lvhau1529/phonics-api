import { Injectable } from '@nestjs/common';
import { type DeleteBlocker, type DeleteImpactKey, type DeletePreview } from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
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

const notDeletable = (blockers: DeleteBlocker[]) =>
  new AppError('ACCOUNT_NOT_DELETABLE', 409, { details: { blockers } });

/**
 * Xoá hẳn học sinh / giáo viên / phụ huynh tạo nhầm (chỉ admin). Dữ liệu phụ thuộc xoá theo FK (cascade); dữ liệu
 * cần giữ (học phí đã xác nhận, nội dung GV soạn, media) thì chặn — admin khoá tài khoản thay vì xoá.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly repo: AccountDeletionRepository,
    private readonly audit: AuditService,
  ) {}

  async studentPreview(id: string): Promise<DeletePreview> {
    await this.assertRole(id, 'STUDENT', 'studentNotFound');
    const { impact, confirmed } = await this.repo.studentCounts(id);
    return toPreview(impact, confirmed > 0 ? ['confirmedAttendance'] : []);
  }

  async deleteStudent(actor: AuthUser, id: string): Promise<void> {
    const user = await this.assertRole(id, 'STUDENT', 'studentNotFound');
    const preview = await this.studentPreview(id);
    if (!preview.canDelete) throw notDeletable(preview.blockers);
    await this.repo.transaction((tx) => this.repo.deleteUser(tx, id));
    await this.audit.record(actor, 'student.delete', 'User', id, { ...user, impact: preview.impact }, null);
  }

  async teacherPreview(id: string): Promise<DeletePreview> {
    await this.assertRole(id, 'TEACHER', 'teacherNotFound');
    const { impact, authored, media } = await this.repo.teacherCounts(id);
    const blockers: DeleteBlocker[] = [];
    if (authored > 0) blockers.push('authoredContent');
    if (media > 0) blockers.push('media');
    return toPreview(impact, blockers);
  }

  async deleteTeacher(actor: AuthUser, id: string): Promise<void> {
    const user = await this.assertRole(id, 'TEACHER', 'teacherNotFound');
    const preview = await this.teacherPreview(id);
    if (!preview.canDelete) throw notDeletable(preview.blockers);
    await this.repo.transaction((tx) => this.repo.deleteUser(tx, id));
    await this.audit.record(actor, 'teacher.delete', 'User', id, { ...user, impact: preview.impact }, null);
  }

  async guardianPreview(id: string): Promise<DeletePreview> {
    const guardian = await this.repo.findGuardian(id);
    if (!guardian) throw notFound('guardianNotFound');
    return toPreview(
      {
        children: await this.repo.countChildren(id),
        familyAccount: guardian.user?.role === 'PARENT' ? 1 : 0,
      },
      [],
    );
  }

  /** Xoá phụ huynh + liên kết với bé + tài khoản gia đình (role PARENT); các bé giữ nguyên */
  async deleteGuardian(actor: AuthUser, id: string): Promise<void> {
    const guardian = await this.repo.findGuardian(id);
    if (!guardian) throw notFound('guardianNotFound');
    const preview = await this.guardianPreview(id);
    const parentUserId = guardian.user?.role === 'PARENT' ? guardian.userId : null;
    await this.repo.transaction(async (tx) => {
      await this.repo.deleteGuardian(tx, id);
      if (!parentUserId) return;
      await this.repo.revokeActorSessions(tx, parentUserId, new Date());
      await this.repo.deleteUser(tx, parentUserId);
    });
    const { user: _user, ...before } = guardian;
    await this.audit.record(
      actor,
      'guardian.delete',
      'Guardian',
      id,
      { ...before, impact: preview.impact },
      null,
    );
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
