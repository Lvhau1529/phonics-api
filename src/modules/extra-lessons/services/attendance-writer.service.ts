import { Injectable } from '@nestjs/common';
import {
  type AttendanceSessionDetail,
  type CancelAttendanceSessionsBody,
  type CancelAttendanceSessionsResponse,
  type CreateAttendanceSessionBody,
  type UpdateAttendanceRecordsBody,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { TimeService } from '@/core/time/time.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { AttendanceReaderService } from '@/modules/extra-lessons/services/attendance-reader.service';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { type SessionDetailRow } from '@/modules/extra-lessons/types/extra.types';
import { resolveRate } from '@/modules/extra-lessons/utils/rate';
import { chargedAfter } from '@/modules/extra-lessons/utils/roster';
import { isoWeekdayOf, sessionTimes } from '@/modules/extra-lessons/utils/session-time';

/**
 * Điểm danh trong app (quyền attendance.confirm, GV buổi mình), xác nhận buổi, buổi bù và huỷ buổi (extra.manageSlots).
 * Buổi đã xác nhận vẫn sửa được (audit) cho tới khi kỳ học phí tháng đó được duyệt.
 */
@Injectable()
export class AttendanceWriterService {
  constructor(
    private readonly repo: AttendanceRepository,
    private readonly schedule: ExtraScheduleRepository,
    private readonly slots: ExtraSlotRepository,
    private readonly reader: AttendanceReaderService,
    private readonly access: ExtraAccessService,
    private readonly audit: AuditService,
    private readonly time: TimeService,
  ) {}

  async updateRecords(
    actor: AuthUser,
    id: string,
    body: UpdateAttendanceRecordsBody,
  ): Promise<AttendanceSessionDetail> {
    const session = await this.editable(actor, id);
    const changes = body.records ?? [];
    if (actor.role !== 'ADMIN' && changes.some((c) => c.charged !== undefined || c.unitPrice !== undefined)) {
      throw new AppError('FORBIDDEN_PERMISSION', 403, { message: 'billingFieldsAdminOnly' });
    }
    const existing = new Map(session.records.map((r) => [r.studentId, r]));
    const added = changes.filter((c) => !existing.has(c.studentId)).map((c) => c.studentId);
    if (added.length) await this.assertStudents(actor, added);
    const removing = body.remove ?? [];
    const notManual = removing.filter((sid) => existing.get(sid)?.source !== 'MANUAL');
    if (notManual.length) {
      throw new AppError('CONFLICT', 409, {
        message: 'removeManualOnly',
        details: { studentIds: notManual },
      });
    }
    const rates = added.length
      ? await this.schedule.ratesFor(added, session.slotId ? [session.slotId] : [])
      : [];

    await this.repo.transaction(async (tx) => {
      for (const c of changes) {
        const current = existing.get(c.studentId);
        const mark = c.mark ?? current?.mark ?? 'PRESENT';
        if (!current) {
          const rate = resolveRate(rates, c.studentId, session.slotId, session.date);
          await this.repo.upsertRecord(
            tx,
            id,
            c.studentId,
            {
              mark,
              note: c.note ?? null,
              unitPrice: c.unitPrice ?? rate.pricePerSession,
              rateId: rate.rateId,
              charged: chargedAfter(mark, c.charged),
              source: 'MANUAL',
              updatedById: actor.id,
            },
            {},
          );
          continue;
        }
        await this.repo.updateRecord(tx, id, c.studentId, {
          mark,
          note: c.note,
          // Đổi điểm danh → tính phí theo BILLING_POLICY, trừ khi admin gửi `charged`
          charged:
            c.mark !== undefined || c.charged !== undefined ? chargedAfter(mark, c.charged) : undefined,
          unitPrice: c.unitPrice,
          updatedById: actor.id,
        });
      }
      if (removing.length) await this.repo.deleteRecords(tx, id, removing, 'MANUAL');
      await this.repo.touchSession(tx, id, body.note !== undefined ? { note: body.note } : {});
    });

    await this.audit.record(
      actor,
      'attendance.updateRecords',
      'AttendanceSession',
      id,
      {
        status: session.status,
        records: changes.flatMap((c) => {
          const r = existing.get(c.studentId);
          return r
            ? [{ studentId: r.studentId, mark: r.mark, charged: r.charged, unitPrice: r.unitPrice }]
            : [];
        }),
      },
      { records: changes, remove: removing, note: body.note },
    );
    return this.reader.detail(actor, id);
  }

  /** Xác nhận trong app. Buổi đã xác nhận (sửa xong) → ghi lại người / lúc xác nhận. */
  async confirm(actor: AuthUser, id: string): Promise<AttendanceSessionDetail> {
    const session = await this.editable(actor, id);
    const by = { userId: actor.id, at: new Date(), via: 'APP' as const };
    if (session.status === 'CONFIRMED') await this.repo.reconfirm(id, by);
    else if (!(await this.repo.confirm(id, by))) {
      throw new AppError('CONFLICT', 409, { message: 'sessionAlreadyConfirmed' });
    }
    await this.audit.record(
      actor,
      'attendance.confirm',
      'AttendanceSession',
      id,
      { status: session.status },
      {
        status: 'CONFIRMED',
        via: 'APP',
      },
    );
    return this.reader.detail(actor, id);
  }

  /** Buổi bù (không theo ca) — thêm học sinh MANUAL sau */
  /** GV (extra.manageSlots): buổi bù phải có mình phụ trách */
  async createMakeup(actor: AuthUser, body: CreateAttendanceSessionBody): Promise<AttendanceSessionDetail> {
    if (actor.role !== 'ADMIN' && !body.teacherIds.includes(actor.id)) {
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { teacherIds: ['keepSelfInSession'] } });
    }
    if ((await this.slots.countTeachers(body.teacherIds)) !== new Set(body.teacherIds).size) {
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { teacherIds: ['notTeacherIds'] } });
    }
    const { id } = await this.repo.transaction((tx) =>
      this.repo.createSession(tx, {
        slotId: null,
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        ...sessionTimes(body.date, body.startTime, body.endTime, this.time.timeZone),
        teacherIds: [...new Set(body.teacherIds)],
        note: body.note ?? null,
      }),
    );
    await this.audit.record(actor, 'attendance.createSession', 'AttendanceSession', id, null, body);
    return this.reader.detail(actor, id);
  }

  /**
   * Huỷ buổi (nghỉ lễ): theo danh sách hoặc cả một ngày. Theo ngày: ca của thứ đó chưa có buổi thì tạo luôn buổi đã huỷ
   * để 00:05 không tạo lại. Buổi huỷ không tính học phí. GV: chỉ buổi / ca mình phụ trách.
   */
  async cancel(
    actor: AuthUser,
    body: CancelAttendanceSessionsBody,
  ): Promise<CancelAttendanceSessionsResponse> {
    const ids: string[] = [];
    const own = actor.role === 'ADMIN' ? undefined : actor.id;
    await this.repo.transaction(async (tx) => {
      if (body.sessionIds) {
        ids.push(...(await this.repo.findCancellable(body.sessionIds, own)).map((s) => s.id));
      } else if (body.date) {
        const date = body.date;
        ids.push(...(await this.repo.findByDate(date, own)).map((s) => s.id));
        const end = this.time.afterIsoDate(date);
        const slots = await this.repo.slotsOnWeekday(isoWeekdayOf(date), end, own);
        const existing = await this.repo.existingSlotDates(
          slots.map((s) => s.id),
          [date],
        );
        for (const slot of slots.filter((s) => !existing.has(`${s.id}:${date}`))) {
          const created = await this.repo.createSession(tx, {
            slotId: slot.id,
            date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            ...sessionTimes(date, slot.startTime, slot.endTime, this.time.timeZone),
            teacherIds: slot.teachers.map((t) => t.teacherId),
            status: 'CANCELLED',
            cancelReason: body.reason,
          });
          ids.push(created.id);
        }
      }
      await this.repo.cancel(tx, ids, body.reason);
    });
    await this.audit.record(actor, 'attendance.cancelSession', 'AttendanceSession', body.date ?? null, null, {
      sessionIds: ids,
      reason: body.reason,
    });
    return { cancelled: ids };
  }

  // ---- helpers ----

  /** Buổi tồn tại, chưa huỷ, người thao tác phụ trách buổi */
  private async editable(actor: AuthUser, id: string): Promise<SessionDetailRow> {
    const session = await this.reader.find(id);
    await this.reader.assertSessionAccess(actor, session);
    if (session.status === 'CANCELLED') throw new AppError('ATTENDANCE_SESSION_CANCELLED', 409);
    return session;
  }

  /** Học sinh thêm tay: tồn tại, ACTIVE, trong phạm vi người thao tác */
  private async assertStudents(actor: AuthUser, ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const student = await this.schedule.findStudent(id);
      if (!student) throw notFound('studentNotFound');
      if (student.status !== 'ACTIVE') throw new AppError('CONFLICT', 409, { message: 'studentNotActive' });
      await this.access.assertStudentAccess(actor, id);
    }
  }
}
