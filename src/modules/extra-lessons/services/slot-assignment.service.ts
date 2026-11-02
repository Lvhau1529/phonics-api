import { Injectable } from '@nestjs/common';
import {
  type ApplyToSessionsBody,
  type ApplyToSessionsResponse,
  type CreateSlotAssignmentBody,
  type DeleteSlotAssignmentResponse,
  type MoveSlotAssignmentBody,
  type SlotAssignment,
  type UpdateSlotAssignmentBody,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { type Tx } from '@/database/types';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toSlotAssignment } from '@/modules/extra-lessons/dto/responses/extra.view';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';
import { type AssignmentRow } from '@/modules/extra-lessons/types/extra.types';
import { type DateRange, rangesOverlap } from '@/modules/extra-lessons/utils/schedule';

/**
 * Sửa lịch học thêm của học sinh (§6.1, quyền extra.manageSchedule): thêm vào ca từ ngày X, rời ca từ ngày Y (sửa
 * `effectiveTo`), sửa ngày nhập sai, chuyển ca từ ngày Z, xoá hẳn dòng thêm nhầm. GV: chỉ ca mình dạy + học sinh trong phạm vi.
 */
@Injectable()
export class SlotAssignmentService {
  constructor(
    private readonly repo: ExtraScheduleRepository,
    private readonly slots: ExtraSlotReaderService,
    private readonly access: ExtraAccessService,
    private readonly audit: AuditService,
    private readonly sync: SessionSyncService,
  ) {}

  async create(actor: AuthUser, studentId: string, body: CreateSlotAssignmentBody): Promise<SlotAssignment> {
    await this.assertStudent(actor, studentId);
    await this.assertOpenSlot(actor, body.slotId);
    const range = { from: body.effectiveFrom, to: body.effectiveTo ?? null };
    const row = await this.repo.transaction(async (tx) => {
      await this.assertNoOverlap(tx, studentId, body.slotId, range);
      return this.repo.createAssignment(tx, {
        studentId,
        slotId: body.slotId,
        effectiveFrom: range.from,
        effectiveTo: range.to,
        note: body.note ?? null,
        createdById: actor.id,
      });
    });
    await this.audit.record(actor, 'slotAssignment.create', 'User', studentId, null, {
      assignmentId: row.id,
      ...body,
    });
    return this.withAffected(row, [body.slotId], range);
  }

  /** Sửa ngày bắt đầu / kết thúc (rời ca từ ngày Y = đặt `effectiveTo`), ghi chú */
  async update(
    actor: AuthUser,
    studentId: string,
    assignmentId: string,
    body: UpdateSlotAssignmentBody,
  ): Promise<SlotAssignment> {
    const current = await this.findAssignment(actor, studentId, assignmentId);
    const range = {
      from: body.effectiveFrom ?? current.effectiveFrom,
      to: body.effectiveTo === undefined ? current.effectiveTo : body.effectiveTo,
    };
    if (range.to !== null && range.to <= range.from) {
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { effectiveTo: ['effectiveToAfterFrom'] } });
    }
    const row = await this.repo.transaction(async (tx) => {
      await this.assertNoOverlap(tx, studentId, current.slotId, range, current.id);
      return this.repo.updateAssignment(tx, current.id, {
        effectiveFrom: range.from,
        effectiveTo: range.to,
        note: body.note,
      });
    });
    await this.audit.record(
      actor,
      'slotAssignment.update',
      'User',
      studentId,
      {
        assignmentId,
        effectiveFrom: current.effectiveFrom,
        effectiveTo: current.effectiveTo,
        note: current.note,
      },
      { assignmentId, ...body },
    );
    // Buổi bị ảnh hưởng nằm trong hợp của khoảng cũ và mới
    return this.withAffected(row, [current.slotId], {
      from: range.from < current.effectiveFrom ? range.from : current.effectiveFrom,
      to:
        range.to === null || current.effectiveTo === null
          ? null
          : range.to > current.effectiveTo
            ? range.to
            : current.effectiveTo,
    });
  }

  /** Chuyển sang ca khác từ ngày Z: dòng cũ kết thúc tại Z, dòng mới [Z, hạn cũ) — trả dòng mới */
  async move(
    actor: AuthUser,
    studentId: string,
    assignmentId: string,
    body: MoveSlotAssignmentBody,
  ): Promise<SlotAssignment> {
    const current = await this.findAssignment(actor, studentId, assignmentId);
    if (body.slotId === current.slotId) throw new AppError('CONFLICT', 409, { message: 'sameSlot' });
    await this.assertOpenSlot(actor, body.slotId);
    if (
      body.from <= current.effectiveFrom ||
      (current.effectiveTo !== null && body.from >= current.effectiveTo)
    ) {
      throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { from: ['moveDateOutOfRange'] } });
    }
    const range = { from: body.from, to: current.effectiveTo };
    const row = await this.repo.transaction(async (tx) => {
      await this.assertNoOverlap(tx, studentId, body.slotId, range);
      await this.repo.updateAssignment(tx, current.id, { effectiveTo: body.from });
      return this.repo.createAssignment(tx, {
        studentId,
        slotId: body.slotId,
        effectiveFrom: range.from,
        effectiveTo: range.to,
        note: body.note ?? null,
        createdById: actor.id,
      });
    });
    await this.audit.record(
      actor,
      'slotAssignment.move',
      'User',
      studentId,
      { assignmentId, slotId: current.slotId },
      { assignmentId: row.id, slotId: body.slotId, from: body.from },
    );
    return this.withAffected(row, [current.slotId, body.slotId], range);
  }

  /**
   * Xoá hẳn một dòng lịch (thêm nhầm): buổi chưa xác nhận trong khoảng của dòng tự bỏ học sinh, buổi đã xác nhận còn
   * học sinh trả về để hỏi người dùng (như khi sửa ngày).
   */
  async remove(
    actor: AuthUser,
    studentId: string,
    assignmentId: string,
  ): Promise<DeleteSlotAssignmentResponse> {
    const current = await this.findAssignment(actor, studentId, assignmentId);
    await this.repo.deleteAssignment(current.id);
    await this.audit.record(
      actor,
      'slotAssignment.delete',
      'User',
      studentId,
      {
        assignmentId,
        slotId: current.slotId,
        effectiveFrom: current.effectiveFrom,
        effectiveTo: current.effectiveTo,
        note: current.note,
      },
      null,
    );
    const affectedSessions = await this.sync.syncStudent(
      studentId,
      [current.slotId],
      current.effectiveFrom,
      current.effectiveTo,
    );
    return { affectedSessions };
  }

  /**
   * Áp lịch hiện tại vào các buổi đã xác nhận được liệt kê (sau modal "Cập nhật luôn N buổi?"). GV chỉ áp được buổi
   * của ca mình dạy.
   */
  async apply(
    actor: AuthUser,
    studentId: string,
    body: ApplyToSessionsBody,
  ): Promise<ApplyToSessionsResponse> {
    if (!(await this.repo.findStudent(studentId))) throw notFound('studentNotFound');
    await this.access.assertStudentAccess(actor, studentId);
    const scope = await this.access.slotScope(actor);
    const sessionIds = scope ? await this.repo.sessionsInSlots(body.sessionIds, scope) : body.sessionIds;
    const updated = await this.sync.applyStudent(studentId, sessionIds);
    if (updated.length) {
      await this.audit.record(actor, 'slotAssignment.apply', 'User', studentId, null, {
        sessionIds: updated,
      });
    }
    return { updated };
  }

  // ---- helpers ----

  /** Đồng bộ buổi đã có theo lịch mới; buổi đã xác nhận lệch trả về để hỏi người dùng */
  private async withAffected(
    row: AssignmentRow,
    slotIds: readonly string[],
    range: DateRange,
  ): Promise<SlotAssignment> {
    const affectedSessions = await this.sync.syncStudent(row.studentId, slotIds, range.from, range.to);
    return { ...toSlotAssignment(row), affectedSessions };
  }

  private async assertStudent(actor: AuthUser, studentId: string): Promise<void> {
    const student = await this.repo.findStudent(studentId);
    if (!student) throw notFound('studentNotFound');
    if (student.status !== 'ACTIVE') throw new AppError('CONFLICT', 409, { message: 'studentNotActive' });
    await this.access.assertStudentAccess(actor, studentId);
  }

  /** Ca tồn tại, chưa lưu trữ, người thao tác dạy ca đó (ADMIN luôn được) */
  private async assertOpenSlot(actor: AuthUser, slotId: string): Promise<void> {
    const slot = await this.slots.find(slotId);
    if (slot.archivedAt) throw new AppError('CONFLICT', 409, { message: 'extraSlotArchived' });
    await this.access.assertSlotAccess(actor, slotId);
  }

  private async findAssignment(
    actor: AuthUser,
    studentId: string,
    assignmentId: string,
  ): Promise<AssignmentRow> {
    const row = await this.repo.findAssignment(assignmentId);
    if (!row || row.studentId !== studentId) throw notFound('slotAssignmentNotFound');
    await this.access.assertSlotAccess(actor, row.slotId);
    return row;
  }

  private async assertNoOverlap(
    tx: Tx,
    studentId: string,
    slotId: string,
    range: DateRange,
    exceptId?: string,
  ): Promise<void> {
    const others = await this.repo.sameSlotRanges(studentId, slotId, tx);
    const clash = others.find(
      (o) => o.id !== exceptId && rangesOverlap(range, { from: o.effectiveFrom, to: o.effectiveTo }),
    );
    if (clash) {
      throw new AppError('SLOT_ASSIGNMENT_OVERLAP', 409, {
        details: { assignmentId: [clash.id] },
      });
    }
  }
}
