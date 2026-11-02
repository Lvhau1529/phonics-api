import { Injectable } from '@nestjs/common';
import {
  type ConvertFamilyBody,
  type ConvertPreview,
  type ConvertResult,
  type FamilyAccountResponse,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toGuardian, toGuardianSummary } from '@/modules/families/dto/responses/family.view';
import { GuardianRepository } from '@/modules/families/repositories/guardian.repository';
import { FamilyInviteService } from '@/modules/families/services/family-invite.service';
import { type GuardianRow } from '@/modules/families/types/family.types';
import { convertPlan } from '@/modules/families/utils/family-rules';

/** Admin tạo tài khoản gia đình cho phụ huynh có sẵn, chuyển học sinh đang tự đăng nhập sang tài khoản gia đình */
@Injectable()
export class FamilyAccountService {
  constructor(
    private readonly repo: GuardianRepository,
    private readonly invites: FamilyInviteService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tạo user PARENT (ACTIVE — admin tạo thì không cần duyệt) + mail mời đặt mật khẩu. Đã có tài khoản nhưng chưa đặt
   * mật khẩu / liên kết Google → gửi lại link mời.
   */
  async createAccount(actor: AuthUser, guardianId: string): Promise<FamilyAccountResponse> {
    const guardian = await this.findGuardian(guardianId);
    const account = toGuardian(guardian).account;
    if (account?.hasCredentials) throw new AppError('CONFLICT', 409, { message: 'guardianHasAccount' });
    if (!guardian.email) throw new AppError('VALIDATION_ERROR', 400, { message: 'guardianEmailRequired' });
    const email = guardian.email;
    if (!account) {
      const owner = await this.repo.findUserByEmail(email);
      if (owner) throw new AppError('EMAIL_TAKEN', 409, { message: 'emailUsedByOtherAccount' });
    }

    await this.repo.transaction(async (tx) => {
      const userId =
        account?.userId ??
        (
          await this.repo.createParentUser(tx, {
            email,
            displayName: guardian.fullName.slice(0, 30),
            status: 'ACTIVE',
          })
        ).id;
      if (!account) await this.repo.update(guardian.id, { userId }, tx);
      await this.invites.enqueue(tx, {
        userId,
        email,
        parentName: guardian.fullName,
        children: guardian.students.map((l) => l.student),
      });
    });
    this.invites.flush();

    await this.audit.record(actor, 'family.create', 'Guardian', guardian.id, null, {
      email,
      resend: !!account,
    });
    return { guardian: toGuardianSummary(await this.findGuardian(guardianId)), inviteSent: true };
  }

  async convertPreview(guardianId: string, body: ConvertFamilyBody): Promise<ConvertPreview> {
    const { guardian, students, plan } = await this.plan(guardianId, body.studentIds);
    const linked = new Set(guardian.students.map((l) => l.studentId));
    return {
      guardian: toGuardian(guardian),
      account: plan.account,
      blockers: plan.blockers,
      students: students.map((s) => {
        const movesCredentials = s.id === plan.credentialsFrom;
        return {
          studentId: s.id,
          displayName: s.displayName,
          vietnameseName: s.studentProfile?.vietnameseName ?? s.displayName,
          englishName: s.studentProfile?.englishName ?? null,
          email: s.email,
          loginMode: s.loginMode,
          alreadyLinked: linked.has(s.id),
          movesCredentials,
          losesOwnLogin: s.loginMode === 'OWN' && !!s.email && !movesCredentials,
        };
      }),
    };
  }

  /**
   * Chuyển các học sinh sang tài khoản gia đình (§10.5): thông tin đăng nhập của học sinh dùng email phụ huynh chuyển
   * sang user PARENT mới; mọi học sinh được chọn → MANAGED, bỏ email / mật khẩu, đăng xuất. Không đổi `users.id` nên
   * điểm, bài nộp, xếp hạng giữ nguyên.
   */
  async convert(actor: AuthUser, guardianId: string, body: ConvertFamilyBody): Promise<ConvertResult> {
    const { guardian, students, plan } = await this.plan(guardianId, body.studentIds);
    if (plan.blockers.length) {
      throw new AppError('VALIDATION_ERROR', 400, {
        message: 'convertBlocked',
        details: { blockers: plan.blockers },
      });
    }
    const source = students.find((s) => s.id === plan.credentialsFrom) ?? null;
    const now = new Date();

    await this.repo.transaction(async (tx) => {
      let parentUserId = guardian.userId;
      if (!parentUserId) {
        if (source) await this.repo.makeManaged(tx, source.id, now); // giải phóng email trước khi tạo user PARENT
        parentUserId = (
          await this.repo.createParentUser(tx, {
            email: guardian.email!,
            displayName: guardian.fullName.slice(0, 30),
            status: 'ACTIVE',
            ...(source
              ? {
                  passwordHash: source.passwordHash,
                  googleSub: source.googleSub,
                  provider: source.provider,
                  emailVerified: source.emailVerified,
                }
              : {}),
          })
        ).id;
        await this.repo.update(guardian.id, { userId: parentUserId }, tx);
      }
      for (const student of students) {
        if (student.id !== source?.id) await this.repo.makeManaged(tx, student.id, now);
        await this.repo.ensureLink(tx, { studentId: student.id, guardianId: guardian.id, canAccess: true });
        if (!(await this.repo.hasBillingContact(tx, student.id))) {
          await this.repo.upsertBillingLink(tx, student.id, guardian.id);
        }
      }
      if (plan.account === 'create') {
        await this.invites.enqueue(tx, {
          userId: parentUserId,
          email: guardian.email!,
          parentName: guardian.fullName,
          children: students.map((s) => ({
            vietnameseName: s.studentProfile?.vietnameseName ?? s.displayName,
            englishName: s.studentProfile?.englishName ?? null,
          })),
        });
      }
    });
    if (plan.account === 'create') this.invites.flush();

    await this.audit.record(actor, 'family.convert', 'Guardian', guardian.id, null, {
      studentIds: body.studentIds,
      account: plan.account,
      movedCredentialsFrom: source?.id ?? null,
    });
    return {
      guardian: toGuardianSummary(await this.findGuardian(guardianId)),
      inviteSent: plan.account === 'create',
      movedCredentialsFrom: source?.id ?? null,
    };
  }

  // ---- helpers ----

  private async findGuardian(id: string): Promise<GuardianRow> {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('guardianNotFound');
    return row;
  }

  private async plan(guardianId: string, studentIds: readonly string[]) {
    const guardian = await this.findGuardian(guardianId);
    const found = await this.repo.findStudentAccounts(studentIds);
    // Giữ thứ tự admin chọn
    const students = studentIds.flatMap((id) => found.filter((s) => s.id === id));
    const emailOwner =
      guardian.email && !guardian.userId ? await this.repo.findUserByEmail(guardian.email) : null;
    const plan = convertPlan({
      guardian: { email: guardian.email, userId: guardian.userId },
      requestedIds: studentIds,
      students,
      emailOwner,
    });
    return { guardian, students, plan };
  }
}
