import { Injectable } from '@nestjs/common';
import {
  type MoveClassBody,
  type ResetPasswordBody,
  type StudentDetail,
  type UpdateStudentBody,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { type Prisma } from '@/generated/prisma/client';
import { AuditService } from '@/modules/audit/services/audit.service';
import { PasswordService } from '@/modules/auth/services/password.service';
import { TokenService } from '@/modules/auth/services/token.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { GuardianWriterService } from '@/modules/families/services/guardian-writer.service';
import { NotificationsService } from '@/modules/notifications/services/notifications.service';
import { RankingService } from '@/modules/points/services/ranking.service';
import { StudentRepository } from '@/modules/students/repositories/student.repository';
import { type StudentRow } from '@/modules/students/types/student.types';
import {
  applyNameChange,
  nameColumns,
  profileNameData,
  type StudentNameColumns,
  type StudentNames,
} from '@/common/utils/student-names';
import {
  assertCanEditFields,
  profileUpdateOf,
  studentAuditDiff,
  studentNamesOf,
} from '@/modules/students/utils/student-rules';
import { StudentReaderService } from '@/modules/students/services/student-reader.service';

/** Sửa học sinh, đổi lớp, đặt lại mật khẩu (kèm audit; khoá tài khoản → thu hồi phiên) */
@Injectable()
export class StudentWriterService {
  constructor(
    private readonly repo: StudentRepository,
    private readonly reader: StudentReaderService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly ranking: RankingService,
    private readonly notifications: NotificationsService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly guardians: GuardianWriterService,
  ) {}

  /** ADMIN: mọi trường; TEACHER (students.edit): chỉ tên / avatarKey */
  async update(actor: AuthUser, id: string, body: UpdateStudentBody): Promise<StudentDetail> {
    const current = await this.reader.findStudent(id);
    await this.access.assertStudentAccess(actor, id);
    assertCanEditFields(actor, body);
    const emailChanged = !!body.email && body.email !== current.email;
    if (emailChanged && (await this.repo.isEmailTaken(body.email!, id)))
      throw new AppError('EMAIL_TAKEN', 409, { fieldErrors: { email: ['EMAIL_TAKEN'] } });

    const currentNames = studentNamesOf(current);
    const nextNames = applyNameChange(currentNames, body);
    const names = nextNames ? nameColumns(nextNames) : null;
    const profileData: Prisma.StudentProfileUpdateInput = {
      ...profileUpdateOf(body),
      ...(names ? profileNameData(names) : {}),
    };
    // Duyệt / từ chối đi qua màn Duyệt tài khoản, không đổi tay sang PENDING / REJECTED
    const reviewing = (s: string | undefined) => s === 'PENDING' || s === 'REJECTED';
    if (
      body.status &&
      (reviewing(body.status) || reviewing(current.status)) &&
      body.status !== current.status
    ) {
      throw new AppError('CONFLICT', 409, { fieldErrors: { status: ['statusViaApproval'] } });
    }
    const updated = await this.repo.transaction(async (tx) => {
      if (body.parent !== undefined) {
        await this.guardians.setBillingContact(tx, id, body.parent, currentNames.vietnameseName);
      }
      return this.repo.update(id, this.userUpdateOf(body, current, names, nextNames, profileData), tx);
    });

    // Vô hiệu phiên đang đăng nhập khi khoá tài khoản
    if (body.status === 'DISABLED' && current.status !== 'DISABLED') await this.tokens.revokeAll(id);

    const { before, after } = studentAuditDiff(body, current, updated);
    if (body.parent !== undefined) after.parent = body.parent;
    if (Object.keys(after).length)
      await this.audit.record(actor, 'student.update', 'User', id, before, after);
    return this.reader.toDetail(actor, updated);
  }

  private userUpdateOf(
    body: UpdateStudentBody,
    current: StudentRow,
    names: StudentNameColumns | null,
    nextNames: StudentNames | null,
    profileData: Prisma.StudentProfileUpdateInput,
  ): Prisma.UserUpdateInput {
    const emailChanged = !!body.email && body.email !== current.email;
    const currentNames = studentNamesOf(current);
    return {
      // Tên hiển thị luôn suy ra từ hai tên (không ghi thẳng body.displayName)
      displayName: names?.displayName,
      avatarKey: body.avatarKey,
      email: body.email,
      // Admin đổi email tay → chưa xác thực lại
      emailVerified: emailChanged ? false : undefined,
      // Cấp email riêng cho bé đang vào qua tài khoản gia đình → bé tự đăng nhập được (phụ huynh vẫn vào được)
      loginMode: emailChanged && current.loginMode === 'MANAGED' ? 'OWN' : undefined,
      status: body.status,
      studentProfile: Object.keys(profileData).length
        ? {
            upsert: {
              create: {
                ...profileNameData(nameColumns(nextNames ?? currentNames)),
                ...profileUpdateOf(body),
              } as Prisma.StudentProfileCreateWithoutUserInput,
              update: profileData,
            },
          }
        : undefined,
    };
  }

  /** Chuyển lớp: đóng membership cũ, mở membership mới, tính lại hạng hai lớp, báo cho học sinh */
  async moveClass(actor: AuthUser, id: string, body: MoveClassBody): Promise<StudentDetail> {
    const student = await this.reader.findStudent(id);
    const current = student.studentProfile?.memberships[0]?.class ?? null;
    if (current?.id === body.classId)
      throw new AppError('CONFLICT', 409, { message: 'studentAlreadyInClass' });
    const target = await this.repo.findClass(body.classId);
    if (!target) throw notFound('classNotFound');
    if (target.archivedAt)
      throw new AppError('CLASS_NOT_JOINABLE', 400, { fieldErrors: { classId: ['classArchived'] } });
    // TEACHER phải dạy cả lớp cũ (nếu có) lẫn lớp mới; ADMIN luôn qua
    if (current) await this.access.assertClassAccess(actor, current.id);
    await this.access.assertClassAccess(actor, target.id);

    await this.repo.transaction(async (tx) => {
      await this.repo.moveMembership(tx, id, target.id, new Date());
      if (current) await this.ranking.recomputeAndNotify(tx, current.id);
      await this.ranking.recomputeAndNotify(tx, target.id, id);
      await this.notifications.create(
        {
          userId: id,
          type: 'CLASS_CHANGED',
          title: `You joined ${target.name}`,
          body: `You are now in ${target.name} (${target.grade}). Keep playing to climb the ranking!`,
          data: { classId: target.id, previousClassId: current?.id ?? null, byUserId: actor.id },
        },
        tx,
      );
    });
    await this.audit.record(
      actor,
      'student.moveClass',
      'User',
      id,
      { classId: current?.id ?? null },
      { classId: target.id, note: body.note ?? null },
    );
    return this.reader.detail(actor, id);
  }

  /** Admin đặt lại mật khẩu: băm mới + đăng xuất mọi thiết bị */
  async resetPassword(actor: AuthUser, id: string, body: ResetPasswordBody): Promise<void> {
    const student = await this.reader.findStudent(id);
    if (student.loginMode === 'MANAGED') {
      throw new AppError('STUDENT_IS_MANAGED', 409, { message: 'managedNoPassword' });
    }
    await this.repo.setPasswordHash(id, await this.passwords.hash(body.newPassword));
    await this.tokens.revokeAll(id);
    await this.audit.record(actor, 'student.resetPassword', 'User', id, null, null);
  }
}
