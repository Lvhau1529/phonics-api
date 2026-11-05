import { Injectable } from '@nestjs/common';
import {
  type CreateGuardianBody,
  type GuardianSummary,
  type ParentContact,
  type SetStudentGuardiansBody,
  type StudentGuardiansResponse,
  type UpdateGuardianBody,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { normalizePhone } from '@/common/utils/phone';
import { type Tx } from '@/database/types';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toGuardianSummary } from '@/modules/families/dto/responses/family.view';
import { GuardianRepository } from '@/modules/families/repositories/guardian.repository';
import { GuardianReaderService } from '@/modules/families/services/guardian-reader.service';

const emailTaken = () =>
  new AppError('GUARDIAN_EMAIL_TAKEN', 409, { fieldErrors: { email: ['GUARDIAN_EMAIL_TAKEN'] } });

/** Ghi phụ huynh + liên kết phụ huynh ↔ học sinh (admin; gắn lúc tạo học sinh: cả GV) */
@Injectable()
export class GuardianWriterService {
  constructor(
    private readonly repo: GuardianRepository,
    private readonly reader: GuardianReaderService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, body: CreateGuardianBody): Promise<GuardianSummary> {
    if (body.email && (await this.repo.isEmailTaken(body.email))) throw emailTaken();
    const row = await this.repo.create({
      fullName: body.fullName,
      email: body.email ?? null,
      phone: body.phone ? normalizePhone(body.phone) : null,
      note: body.note ?? null,
    });
    await this.audit.record(actor, 'guardian.create', 'Guardian', row.id, null, body);
    return toGuardianSummary(row);
  }

  /** Đổi email của phụ huynh có tài khoản gia đình = đổi luôn email đăng nhập */
  async update(actor: AuthUser, id: string, body: UpdateGuardianBody): Promise<GuardianSummary> {
    const current = await this.repo.findById(id);
    if (!current) throw notFound('guardianNotFound');
    const emailChanged = body.email !== undefined && body.email !== current.email;
    if (emailChanged && body.email && (await this.repo.isEmailTaken(body.email, id))) throw emailTaken();
    if (emailChanged && body.email && current.userId) {
      const owner = await this.repo.findUserByEmail(body.email);
      if (owner && owner.id !== current.userId) {
        throw new AppError('EMAIL_TAKEN', 409, { fieldErrors: { email: ['EMAIL_TAKEN'] } });
      }
    }

    const row = await this.repo.transaction(async (tx) => {
      if (emailChanged && body.email && current.userId) {
        await this.repo.updateUser(current.userId, { email: body.email, emailVerified: false }, tx);
      }
      if (body.fullName && current.userId) {
        await this.repo.updateUser(current.userId, { displayName: body.fullName.slice(0, 30) }, tx);
      }
      return this.repo.update(
        id,
        {
          fullName: body.fullName,
          email: body.email,
          phone: body.phone === undefined ? undefined : body.phone && normalizePhone(body.phone),
          note: body.note,
        },
        tx,
      );
    });
    await this.audit.record(
      actor,
      'guardian.update',
      'Guardian',
      id,
      { fullName: current.fullName, email: current.email, phone: current.phone, note: current.note },
      body,
    );
    return toGuardianSummary(row);
  }

  /** Thay toàn bộ phụ huynh của học sinh. Phụ huynh thôi được vào hồ sơ bé → phiên phụ huynh đã mở hết hiệu lực. */
  async setStudentGuardians(
    actor: AuthUser,
    studentId: string,
    body: SetStudentGuardiansBody,
  ): Promise<StudentGuardiansResponse> {
    await this.reader.assertStudent(studentId);
    const ids = body.guardians.map((g) => g.guardianId);
    if ((await this.repo.countGuardians(ids)) !== ids.length) throw notFound('guardianNotFound');
    const before = await this.repo.studentLinks(studentId);
    const now = new Date();

    await this.repo.transaction(async (tx) => {
      await this.repo.replaceStudentLinks(
        tx,
        studentId,
        body.guardians.map((g) => ({
          guardianId: g.guardianId,
          relation: g.relation,
          isBillingContact: g.isBillingContact,
          receivesReports: g.receivesReports,
          canAccess: g.canAccess,
        })),
      );
      for (const link of before) {
        const parentUserId = link.guardian.userId;
        if (!parentUserId || !link.canAccess) continue;
        const still = body.guardians.find((g) => g.guardianId === link.guardianId);
        if (!still?.canAccess) await this.repo.revokeActorSessions(tx, studentId, parentUserId, now);
      }
    });

    await this.audit.record(
      actor,
      'guardian.link',
      'User',
      studentId,
      before.map(({ guardianId, relation, isBillingContact, receivesReports, canAccess }) => ({
        guardianId,
        relation,
        isBillingContact,
        receivesReports,
        canAccess,
      })),
      body.guardians,
    );
    return { items: await this.reader.forStudent(studentId) };
  }

  /**
   * Học sinh vừa tạo (`POST /students`): một phụ huynh nhận học phí chung cho các bé — trùng email phụ huynh có sẵn
   * thì gắn vào phụ huynh đó (anh chị em gộp một mail học phí), không thì tạo mới.
   */
  async linkBillingContactForNew(
    tx: Tx,
    studentIds: readonly string[],
    parent: ParentContact,
    fallbackName: string,
  ): Promise<void> {
    if (!parent.name && !parent.email && !parent.phone) return;
    await this.linkNewBillingContact(tx, studentIds, {
      fullName: parent.name ?? `Phụ huynh ${fallbackName}`.slice(0, 60),
      email: parent.email ?? null,
      phone: parent.phone ? normalizePhone(parent.phone) : null,
    });
  }

  private async linkNewBillingContact(
    tx: Tx,
    studentIds: readonly string[],
    data: { fullName: string; email: string | null; phone: string | null },
  ): Promise<void> {
    const existing = data.email ? await this.repo.findIdByEmail(data.email, tx) : null;
    const guardianId = existing?.id ?? (await this.repo.create(data, tx)).id;
    for (const studentId of studentIds) await this.repo.upsertBillingLink(tx, studentId, guardianId);
  }
}
