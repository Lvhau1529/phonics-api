import { Injectable } from '@nestjs/common';
import {
  type CreateStudentsBody,
  type CreateStudentsResponse,
  DEFAULT_AVATAR,
  type NewStudentInput,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { nameColumns, profileNameData } from '@/common/utils/student-names';
import { AccessService } from '@/core/access/access.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ExtraEnrollmentService } from '@/modules/extra-lessons/services/extra-enrollment.service';
import { GuardianWriterService } from '@/modules/families/services/guardian-writer.service';
import { StudentRepository } from '@/modules/students/repositories/student.repository';
import { StudentReaderService } from '@/modules/students/services/student-reader.service';

/**
 * Thêm học sinh chưa có tài khoản (quyền students.create): user STUDENT, ACTIVE, MANAGED (không email / mật khẩu) —
 * cấp đăng nhập sau qua tài khoản gia đình của phụ huynh. Một transaction: học sinh + lớp chính + ca học thêm + giá
 * riêng + phụ huynh nhận học phí chung. GV: mỗi bé phải vào lớp mình dạy hoặc ca mình dạy (không thì tạo ra học sinh
 * ngoài phạm vi của chính mình).
 */
@Injectable()
export class StudentCreatorService {
  constructor(
    private readonly repo: StudentRepository,
    private readonly reader: StudentReaderService,
    private readonly access: AccessService,
    private readonly enrollment: ExtraEnrollmentService,
    private readonly guardians: GuardianWriterService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, body: CreateStudentsBody): Promise<CreateStudentsResponse> {
    await this.assertPlacements(actor, body.students);
    const effectiveFrom = body.effectiveFrom ?? this.enrollment.today();
    const now = new Date();

    const ids = await this.repo.transaction(async (tx) => {
      const created: string[] = [];
      for (const input of body.students) {
        const names = nameColumns({
          vietnameseName: input.vietnameseName,
          englishName: input.englishName ?? null,
        });
        const id = await this.repo.create(tx, {
          role: 'STUDENT',
          status: 'ACTIVE',
          displayName: names.displayName,
          avatarKey: input.avatarKey ?? DEFAULT_AVATAR,
          studentProfile: { create: { ...profileNameData(names), reviewedById: actor.id, reviewedAt: now } },
        });
        if (input.classId) await this.repo.createMembership(tx, id, input.classId, now);
        if (input.slotId) {
          await this.enrollment.enroll(tx, actor, id, {
            slotId: input.slotId,
            effectiveFrom,
            pricePerSession: input.pricePerSession,
          });
        }
        created.push(id);
      }
      if (body.parent) {
        await this.guardians.linkBillingContactForNew(
          tx,
          created,
          body.parent,
          body.students[0]!.vietnameseName,
        );
      }
      return created;
    });

    // Buổi PENDING đã tạo (hôm nay / ngày đã qua) thêm luôn các bé; buổi đã xác nhận trả về để hỏi người dùng
    const affectedSessions: CreateStudentsResponse['affectedSessions'] = [];
    for (const [i, input] of body.students.entries()) {
      if (!input.slotId) continue;
      const studentId = ids[i]!;
      const affected = await this.enrollment.syncAfterEnroll(studentId, {
        slotId: input.slotId,
        effectiveFrom,
      });
      affectedSessions.push(...affected.map((s) => ({ ...s, studentId })));
    }

    for (const [i, input] of body.students.entries()) {
      await this.audit.record(actor, 'student.create', 'User', ids[i]!, null, {
        ...input,
        effectiveFrom: input.slotId ? effectiveFrom : undefined,
        parent: body.parent,
      });
    }
    const rows = await this.reader.findStudents(ids);
    const items = await Promise.all(rows.map((row) => this.reader.toDetail(actor, row)));
    return { items, affectedSessions };
  }

  /** Lớp / ca tồn tại, chưa lưu trữ, trong phạm vi người thao tác; GV bắt buộc chọn ít nhất một */
  private async assertPlacements(actor: AuthUser, students: readonly NewStudentInput[]): Promise<void> {
    const checkedClasses = new Set<string>();
    const checkedSlots = new Set<string>();
    for (const [i, s] of students.entries()) {
      if (actor.role !== 'ADMIN' && !s.classId && !s.slotId) {
        throw new AppError('VALIDATION_ERROR', 400, {
          fieldErrors: { [`students.${i}.classId`]: ['placementRequired'] },
        });
      }
      if (s.classId && !checkedClasses.has(s.classId)) {
        const target = await this.repo.findClass(s.classId);
        if (!target) throw notFound('classNotFound');
        if (target.archivedAt) {
          throw new AppError('CLASS_NOT_JOINABLE', 400, {
            fieldErrors: { [`students.${i}.classId`]: ['classArchived'] },
          });
        }
        await this.access.assertClassAccess(actor, s.classId);
        checkedClasses.add(s.classId);
      }
      const slotKey = `${s.slotId}:${s.pricePerSession !== undefined}`;
      if (s.slotId && !checkedSlots.has(slotKey)) {
        await this.enrollment.assertCanEnroll(actor, s.slotId, s.pricePerSession !== undefined);
        checkedSlots.add(slotKey);
      }
    }
  }
}
