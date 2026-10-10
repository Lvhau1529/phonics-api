import { Injectable } from '@nestjs/common';
import {
  type MoveClassBody,
  type ResetPasswordBody,
  type StudentDetail,
  type UpdateStudentBody,
} from '@phonics/contracts';
import { AppError, notFound } from '../../../common/errors/app-error';
import { AccessService } from '../../../core/access/access.service';
import { type Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { PasswordService } from '../../auth/services/password.service';
import { TokenService } from '../../auth/services/token.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { RankingService } from '../../points/services/ranking.service';
import { StudentRepository } from '../repositories/student.repository';
import { assertCanEditFields, profileUpdateOf, studentAuditDiff } from '../utils/student-rules';
import { StudentReaderService } from './student-reader.service';

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
  ) {}

  /** ADMIN: mọi trường; TEACHER (students.edit): chỉ displayName / avatarKey */
  async update(actor: AuthUser, id: string, body: UpdateStudentBody): Promise<StudentDetail> {
    const current = await this.reader.findStudent(id);
    await this.access.assertStudentAccess(actor, id);
    assertCanEditFields(actor, body);
    const emailChanged = !!body.email && body.email !== current.email;
    if (emailChanged && (await this.repo.isEmailTaken(body.email!, id)))
      throw new AppError('EMAIL_TAKEN', 409, { details: { email: ['Email đã được sử dụng'] } });

    const profileData = profileUpdateOf(body);
    const updated = await this.repo.update(id, {
      displayName: body.displayName,
      avatarKey: body.avatarKey,
      email: body.email,
      // Admin đổi email tay → chưa xác thực lại
      emailVerified: emailChanged ? false : undefined,
      status: body.status,
      studentProfile: Object.keys(profileData).length
        ? {
            upsert: {
              create: profileData as Prisma.StudentProfileCreateWithoutUserInput,
              update: profileData,
            },
          }
        : undefined,
    });

    // Vô hiệu phiên đang đăng nhập khi khoá tài khoản
    if (body.status === 'DISABLED' && current.status !== 'DISABLED') await this.tokens.revokeAll(id);

    const { before, after } = studentAuditDiff(body, current, updated);
    if (Object.keys(after).length)
      await this.audit.record(actor, 'student.update', 'User', id, before, after);
    return this.reader.toDetail(actor, updated);
  }

  /** Chuyển lớp: đóng membership cũ, mở membership mới, tính lại hạng hai lớp, báo cho học sinh */
  async moveClass(actor: AuthUser, id: string, body: MoveClassBody): Promise<StudentDetail> {
    const student = await this.reader.findStudent(id);
    const current = student.studentProfile?.memberships[0]?.class ?? null;
    if (current?.id === body.classId)
      throw new AppError('CONFLICT', 409, { message: 'Học sinh đang ở lớp này rồi' });
    const target = await this.repo.findClass(body.classId);
    if (!target) throw notFound('Không tìm thấy lớp');
    if (target.archivedAt)
      throw new AppError('CLASS_NOT_JOINABLE', 400, { details: { classId: ['Lớp đã lưu trữ'] } });
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
    await this.reader.findStudent(id);
    await this.repo.setPasswordHash(id, await this.passwords.hash(body.newPassword));
    await this.tokens.revokeAll(id);
    await this.audit.record(actor, 'student.resetPassword', 'User', id, null, null);
  }
}
