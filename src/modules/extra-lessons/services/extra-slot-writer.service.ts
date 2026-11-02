import { Injectable } from '@nestjs/common';
import {
  type CreateExtraSlotBody,
  type ExtraSlot,
  type SetSlotTeachersBody,
  type UpdateExtraSlotBody,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { ExtraLessonsScheduler } from '@/modules/extra-lessons/jobs/extra-lessons.scheduler';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';

/** Tạo / sửa / lưu trữ ca, gán GV (quyền extra.manageSlots — kiểm tra ở controller) */
@Injectable()
export class ExtraSlotWriterService {
  constructor(
    private readonly repo: ExtraSlotRepository,
    private readonly reader: ExtraSlotReaderService,
    private readonly audit: AuditService,
    private readonly scheduler: ExtraLessonsScheduler,
  ) {}

  async create(actor: AuthUser, body: CreateExtraSlotBody): Promise<ExtraSlot> {
    const { teacherIds = [], ...data } = body;
    await this.assertRefs(data.classId, teacherIds);
    const row = await this.repo.transaction(async (tx) => {
      const slot = await this.repo.create(tx, data);
      await this.repo.setTeachers(tx, slot.id, teacherIds);
      return slot;
    });
    await this.audit.record(actor, 'extraSlot.create', 'ExtraSlot', row.id, null, body);
    // Ca của hôm nay (đã qua 00:05) có buổi luôn
    await this.scheduler.reschedule();
    return this.reader.detail(actor, row.id);
  }

  /** Đổi giờ / thứ chỉ ảnh hưởng buổi chưa tạo (buổi điểm danh lưu giờ riêng) */
  async update(actor: AuthUser, id: string, body: UpdateExtraSlotBody): Promise<ExtraSlot> {
    const current = await this.reader.find(id);
    if (current.archivedAt) throw new AppError('CONFLICT', 409, { message: 'extraSlotArchived' });
    if (body.classId) await this.assertRefs(body.classId, []);
    // Sửa một giờ: so với giờ còn lại đang lưu
    const start = body.startTime ?? current.startTime;
    const end = body.endTime ?? current.endTime;
    if (end <= start)
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { endTime: ['endAfterStart'] } });
    await this.repo.transaction((tx) => this.repo.update(tx, id, body));
    await this.audit.record(
      actor,
      'extraSlot.update',
      'ExtraSlot',
      id,
      Object.fromEntries(Object.keys(body).map((k) => [k, current[k as keyof typeof current]])),
      body,
    );
    if (body.weekday !== undefined) await this.scheduler.reschedule();
    return this.reader.detail(actor, id);
  }

  /** Lưu trữ: học sinh đang học ca kết thúc từ hôm nay; buổi đã điểm danh giữ nguyên */
  async archive(actor: AuthUser, id: string): Promise<void> {
    const current = await this.reader.find(id);
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
    const teacherIds = [...new Set(body.teacherIds)];
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

  private async assertRefs(classId: string | undefined, teacherIds: readonly string[]): Promise<void> {
    if (classId && !(await this.repo.findClass(classId))) throw notFound('classNotFound');
    if (teacherIds.length && (await this.repo.countTeachers(teacherIds)) !== new Set(teacherIds).size) {
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { teacherIds: ['notTeacherIds'] } });
    }
  }
}
