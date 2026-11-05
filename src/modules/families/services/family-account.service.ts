import { Injectable } from '@nestjs/common';
import { type FamilyAccountResponse } from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toGuardian, toGuardianSummary } from '@/modules/families/dto/responses/family.view';
import { GuardianRepository } from '@/modules/families/repositories/guardian.repository';
import { FamilyInviteService } from '@/modules/families/services/family-invite.service';
import { type GuardianRow } from '@/modules/families/types/family.types';

/** Admin tạo tài khoản gia đình (user PARENT + mail mời đặt mật khẩu) cho phụ huynh có sẵn */
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

  // ---- helpers ----

  private async findGuardian(id: string): Promise<GuardianRow> {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('guardianNotFound');
    return row;
  }
}
