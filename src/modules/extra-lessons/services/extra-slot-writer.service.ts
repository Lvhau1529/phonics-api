import { Injectable } from '@nestjs/common';
import {
  type CreateExtraSlotBody,
  type ExtraSlot,
  type SetSlotTeachersBody,
  type UpdateExtraSlotBody,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { TimeService } from '@/core/time/time.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { ExtraLessonsScheduler } from '@/modules/extra-lessons/jobs/extra-lessons.scheduler';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { sessionTimes } from '@/modules/extra-lessons/utils/session-time';

/**
 * Tạo / sửa / lưu trữ ca, gán GV (quyền extra.manageSlots — kiểm tra ở controller). GV: ca mình tạo tự có mình phụ
 * trách; chỉ sửa / lưu trữ / gán GV ca mình dạy, luôn giữ mình trong danh sách GV; lớp tham khảo phải là lớp mình dạy.
 */
@Injectable()
export class ExtraSlotWriterService {
  constructor(
    private readonly repo: ExtraSlotRepository,
    private readonly reader: ExtraSlotReaderService,
    private readonly audit: AuditService,
    private readonly scheduler: ExtraLessonsScheduler,
    private readonly extraAccess: ExtraAccessService,
    private readonly access: AccessService,
    private readonly time: TimeService,
  ) {}

  async create(actor: AuthUser, body: CreateExtraSlotBody): Promise<ExtraSlot> {
    const { teacherIds: requested = [], ...data } = body;
    const teacherIds = this.withSelf(actor, requested);
    await this.assertRefs(data.classId, teacherIds);
    if (data.classId) await this.access.assertClassAccess(actor, data.classId);
    const row = await this.repo.transaction(async (tx) => {
      const slot = await this.repo.create(tx, data);
      await this.repo.setTeachers(tx, slot.id, teacherIds);
      return slot;
    });
    await this.audit.record(actor, 'extraSlot.create', 'ExtraSlot', row.id, null, { ...body, teacherIds });
    // Ca của hôm nay (đã qua 00:05) có buổi luôn
    await this.scheduler.reschedule();
    return this.reader.detail(actor, row.id);
  }

  /**
   * Đổi giờ: áp cho cả buổi đã tạo từ `timeFrom` (mặc định hôm nay, kể cả buổi đã xác nhận — giờ không ảnh hưởng
   * tiền). Đổi thứ chỉ ảnh hưởng buổi chưa tạo.
   */
  async update(actor: AuthUser, id: string, input: UpdateExtraSlotBody): Promise<ExtraSlot> {
    const { timeFrom, ...body } = input;
    const current = await this.reader.find(id);
    await this.extraAccess.assertSlotAccess(actor, id);
    if (current.archivedAt) throw new AppError('CONFLICT', 409, { message: 'extraSlotArchived' });
    if (body.classId) {
      await this.assertRefs(body.classId, []);
      await this.access.assertClassAccess(actor, body.classId);
    }
    // Sửa một giờ: so với giờ còn lại đang lưu
    const start = body.startTime ?? current.startTime;
    const end = body.endTime ?? current.endTime;
    if (end <= start)
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { endTime: ['endAfterStart'] } });
    const retimed = await this.repo.transaction(async (tx) => {
      await this.repo.update(tx, id, body);
      if (body.startTime === undefined || (start === current.startTime && end === current.endTime)) return 0;
      const sessions = await this.repo.sessionsFrom(tx, id, timeFrom ?? this.reader.today());
      for (const s of sessions) {
        await this.repo.updateSessionTime(tx, s.id, {
          startTime: start,
          endTime: end,
          ...sessionTimes(s.date, start, end, this.time.timeZone),
        });
      }
      return sessions.length;
    });
    await this.audit.record(
      actor,
      'extraSlot.update',
      'ExtraSlot',
      id,
      Object.fromEntries(Object.keys(body).map((k) => [k, current[k as keyof typeof current]])),
      retimed ? { ...body, timeFrom, retimedSessions: retimed } : body,
    );
    if (body.weekday !== undefined) await this.scheduler.reschedule();
    return this.reader.detail(actor, id);
  }

  /** Lưu trữ: học sinh đang học ca kết thúc từ hôm nay; buổi đã điểm danh giữ nguyên */
  async archive(actor: AuthUser, id: string): Promise<void> {
    const current = await this.reader.find(id);
    await this.extraAccess.assertSlotAccess(actor, id);
    if (current.archivedAt) return;
    const today = this.reader.today();
    const closed = await this.repo.transaction(async (tx) => {
      await this.repo.update(tx, id, { archivedAt: new Date() });
      return this.repo.closeAssignments(tx, id, today);
    });
    await this.audit.record(actor, 'extraSlot.archive', 'ExtraSlot', id, null, {
      closedAssignments: closed,
      today,
    });
  }

  async setTeachers(actor: AuthUser, id: string, body: SetSlotTeachersBody): Promise<ExtraSlot> {
    const current = await this.reader.find(id);
    await this.extraAccess.assertSlotAccess(actor, id);
    const teacherIds = [...new Set(body.teacherIds)];
    // GV bỏ mình ra khỏi ca = ca ra ngoài phạm vi của chính mình
    if (actor.role !== 'ADMIN' && !teacherIds.includes(actor.id)) {
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { teacherIds: ['keepSelfInSlot'] } });
    }
    await this.assertRefs(undefined, teacherIds);
    await this.repo.transaction((tx) => this.repo.setTeachers(tx, id, teacherIds));
    await this.audit.record(
      actor,
      'extraSlot.setTeachers',
      'ExtraSlot',
      id,
      { teacherIds: current.teachers.map((t) => t.teacher.id) },
      { teacherIds },
    );
    return this.reader.detail(actor, id);
  }

  /** GV tạo ca → luôn phụ trách ca đó */
  private withSelf(actor: AuthUser, teacherIds: readonly string[]): string[] {
    const ids = new Set(teacherIds);
    if (actor.role === 'TEACHER') ids.add(actor.id);
    return [...ids];
  }

  private async assertRefs(classId: string | undefined, teacherIds: readonly string[]): Promise<void> {
    if (classId && !(await this.repo.findClass(classId))) throw notFound('classNotFound');
    if (teacherIds.length && (await this.repo.countTeachers(teacherIds)) !== new Set(teacherIds).size) {
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { teacherIds: ['notTeacherIds'] } });
    }
  }
}
