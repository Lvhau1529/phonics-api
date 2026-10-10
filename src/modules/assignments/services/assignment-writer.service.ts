import { Injectable } from '@nestjs/common';
import {
  type AssignmentDetail,
  type CreateAssignmentBody,
  type UpdateAssignmentBody,
} from '@phonics/contracts';
import { AppError } from '../../../common/errors/app-error';
import { AccessService } from '../../../core/access/access.service';
import { TimeService } from '../../../core/time/time.service';
import { type Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { WorksheetReaderService } from '../../worksheets/services/worksheet-reader.service';
import { buildSnapshot, hasManualItems, itemsOf } from '../../worksheets/utils/worksheet-snapshot';
import { toAssignmentAudit } from '../dto/responses/assignment.view';
import { AssignmentRepository } from '../repositories/assignment.repository';
import { dateOnly, isoDateOf, statusByWindow } from '../utils/assignment-dates';
import { AssignmentLifecycleService } from './assignment-lifecycle.service';
import { AssignmentReaderService } from './assignment-reader.service';

const dueAfterOpenError = () =>
  new AppError('VALIDATION_ERROR', 400, { details: { dueAt: ['Hạn nộp phải sau thời điểm mở'] } });

/**
 * Tạo / sửa / đóng / mở lại / xoá bài giao (ADR 0017): snapshot nội dung lúc giao, cửa sổ thời gian, số lần làm.
 * GV chỉ thao tác trên lớp mình; mọi thay đổi ghi audit.
 */
@Injectable()
export class AssignmentWriterService {
  constructor(
    private readonly repo: AssignmentRepository,
    private readonly reader: AssignmentReaderService,
    private readonly lifecycle: AssignmentLifecycleService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly time: TimeService,
    private readonly worksheets: WorksheetReaderService,
  ) {}

  async create(actor: AuthUser, body: CreateAssignmentBody): Promise<AssignmentDetail> {
    await this.access.assertClassAccess(actor, body.classId);
    const source = await this.worksheets.loadForSnapshot(actor, body.worksheetId);
    if (source.status !== 'PUBLISHED') throw new AppError('WORKSHEET_NOT_PUBLISHED', 409);
    const now = new Date();
    const snapshot = buildSnapshot(source, now);
    if (!itemsOf(snapshot).length) throw new AppError('WORKSHEET_EMPTY', 409);

    const availableFrom = body.availableFrom
      ? new Date(body.availableFrom)
      : this.time.fromIsoDate(body.scheduledFor);
    const dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (dueAt && dueAt <= availableFrom) throw dueAfterOpenError();
    const open = statusByWindow(availableFrom, now) === 'OPEN';

    const row = await this.repo.transaction(async (tx) => {
      const created = await this.repo.create(
        {
          worksheetId: body.worksheetId,
          classId: body.classId,
          assignedById: actor.id,
          scheduledFor: dateOnly(body.scheduledFor),
          availableFrom,
          dueAt,
          allowLate: body.allowLate,
          maxAttempts: body.maxAttempts,
          showAnswersAfterSubmit: body.showAnswersAfterSubmit,
          status: open ? 'OPEN' : 'SCHEDULED',
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          maxScore: snapshot.maxScore,
          hasManualItems: hasManualItems(snapshot),
          openedAt: open ? now : null,
        },
        tx,
      );
      if (open) await this.lifecycle.notifyOpened(tx, created);
      return created;
    });
    await this.audit.record(actor, 'assignment.create', 'Assignment', row.id, null, {
      worksheetId: row.worksheetId,
      classId: row.classId,
      scheduledFor: isoDateOf(row.scheduledFor),
      status: row.status,
    });
    return this.reader.detail(row);
  }

  async update(actor: AuthUser, id: string, body: UpdateAssignmentBody): Promise<AssignmentDetail> {
    const current = await this.reader.load(actor, id);
    const availableFrom = body.availableFrom ? new Date(body.availableFrom) : current.availableFrom;
    const dueAt = body.dueAt === undefined ? current.dueAt : body.dueAt ? new Date(body.dueAt) : null;
    if (dueAt && dueAt <= availableFrom) throw dueAfterOpenError();
    const now = new Date();
    // Bài đã CLOSED giữ nguyên; còn lại tính lại SCHEDULED / OPEN theo availableFrom mới
    const status = current.status === 'CLOSED' ? 'CLOSED' : statusByWindow(availableFrom, now);
    const opensNow = current.status === 'SCHEDULED' && status === 'OPEN';

    const row = await this.repo.transaction(async (tx) => {
      const updated = await this.repo.update(
        id,
        {
          scheduledFor: body.scheduledFor ? dateOnly(body.scheduledFor) : undefined,
          availableFrom,
          dueAt,
          allowLate: body.allowLate,
          maxAttempts: body.maxAttempts,
          showAnswersAfterSubmit: body.showAnswersAfterSubmit,
          status,
          openedAt: opensNow ? now : undefined,
        },
        tx,
      );
      if (opensNow) await this.lifecycle.notifyOpened(tx, updated);
      return updated;
    });
    await this.audit.record(
      actor,
      'assignment.update',
      'Assignment',
      id,
      toAssignmentAudit(current),
      toAssignmentAudit(row),
    );
    return this.reader.detail(row);
  }

  async close(actor: AuthUser, id: string): Promise<AssignmentDetail> {
    const current = await this.reader.load(actor, id);
    if (current.status === 'CLOSED') return this.reader.detail(current);
    const row = await this.repo.update(id, { status: 'CLOSED', closedAt: new Date() });
    await this.audit.record(
      actor,
      'assignment.close',
      'Assignment',
      id,
      { status: current.status },
      { status: 'CLOSED' },
    );
    return this.reader.detail(row);
  }

  async reopen(actor: AuthUser, id: string): Promise<AssignmentDetail> {
    const current = await this.reader.load(actor, id);
    if (current.status !== 'CLOSED') return this.reader.detail(current);
    const now = new Date();
    const status = statusByWindow(current.availableFrom, now);
    const row = await this.repo.update(id, {
      status,
      closedAt: null,
      openedAt: status === 'OPEN' ? (current.openedAt ?? now) : current.openedAt,
    });
    await this.audit.record(actor, 'assignment.reopen', 'Assignment', id, { status: 'CLOSED' }, { status });
    return this.reader.detail(row);
  }

  /** Chỉ xoá được khi chưa có bài nộp (đã có thì đóng bài) */
  async remove(actor: AuthUser, id: string): Promise<void> {
    const current = await this.reader.load(actor, id);
    if ((await this.repo.countSubmissions(id)) > 0)
      throw new AppError('CONFLICT', 409, { message: 'Đã có bài nộp — hãy đóng bài thay vì xoá' });
    await this.repo.delete(id);
    await this.audit.record(actor, 'assignment.delete', 'Assignment', id, toAssignmentAudit(current), null);
  }
}
