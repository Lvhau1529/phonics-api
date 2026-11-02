import { Injectable } from '@nestjs/common';
import {
  type ApplyToSessionsBody,
  type ApplyToSessionsResponse,
  type CreateSlotRateBody,
  type CreateStudentRateBody,
  type ExtraRate,
  type ExtraRatesResponse,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toExtraRate } from '@/modules/extra-lessons/dto/responses/extra.view';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { type RateScope, SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';
import { planRateInsert } from '@/modules/extra-lessons/utils/rate';

/**
 * Đơn giá học thêm (§6.2): giá mặc định của ca (GV ca đó / admin), giá riêng học sinh (GV chỉ khi mọi ca học sinh đang
 * học đều do mình dạy, vì giá áp cho mọi ca). Quyền extra.viewPricing / extra.managePricing kiểm tra ở controller.
 */
@Injectable()
export class ExtraRateService {
  constructor(
    private readonly repo: ExtraScheduleRepository,
    private readonly slots: ExtraSlotReaderService,
    private readonly access: ExtraAccessService,
    private readonly audit: AuditService,
    private readonly sync: SessionSyncService,
  ) {}

  async slotRates(user: AuthUser, slotId: string): Promise<ExtraRatesResponse> {
    await this.slots.find(slotId);
    await this.access.assertSlotAccess(user, slotId);
    return { items: (await this.repo.ratesOfScope(null, slotId)).map(toExtraRate) };
  }

  async createSlotRate(actor: AuthUser, slotId: string, body: CreateSlotRateBody): Promise<ExtraRate> {
    await this.slots.find(slotId);
    await this.access.assertSlotAccess(actor, slotId);
    return this.insert(actor, null, slotId, body);
  }

  async studentRates(user: AuthUser, studentId: string): Promise<ExtraRatesResponse> {
    await this.assertStudent(user, studentId);
    return { items: (await this.repo.studentRates(studentId)).map(toExtraRate) };
  }

  async createStudentRate(
    actor: AuthUser,
    studentId: string,
    body: CreateStudentRateBody,
  ): Promise<ExtraRate> {
    await this.assertStudent(actor, studentId);
    if (body.slotId) {
      await this.slots.find(body.slotId);
      await this.access.assertSlotAccess(actor, body.slotId);
    } else if (!(await this.access.canSetStudentRate(actor, studentId, this.slots.today()))) {
      throw new AppError('RATE_SCOPE_FORBIDDEN', 403);
    }
    return this.insert(actor, studentId, body.slotId ?? null, body);
  }

  /** Giá mới cùng phạm vi: đóng / thay thế dòng cũ theo `planRateInsert`, trong transaction có khoá phạm vi */
  private async insert(
    actor: AuthUser,
    studentId: string | null,
    slotId: string | null,
    body: CreateSlotRateBody,
  ): Promise<ExtraRate> {
    const { row, changes } = await this.repo.transaction(async (tx) => {
      const sameScope = await this.repo.lockScope(tx, studentId, slotId);
      const plan = planRateInsert(sameScope, body.effectiveFrom);
      await this.repo.setRateEnds(tx, plan);
      const created = await this.repo.createRate(tx, {
        studentId,
        slotId,
        pricePerSession: body.pricePerSession,
        effectiveFrom: body.effectiveFrom,
        note: body.note ?? null,
        createdById: actor.id,
      });
      return { row: created, changes: plan };
    });
    await this.audit.record(
      actor,
      'extraRate.create',
      studentId ? 'User' : 'ExtraSlot',
      studentId ?? slotId,
      null,
      {
        rateId: row.id,
        slotId,
        pricePerSession: body.pricePerSession,
        effectiveFrom: body.effectiveFrom,
        closed: changes,
      },
    );
    // Buổi chưa xác nhận tự tính lại; buổi đã xác nhận có giá khác → trả về để hỏi người dùng
    const affectedRecords = await this.sync.repriceForRate(row);
    return { ...toExtraRate(row), affectedRecords };
  }

  /** Áp giá vào bản ghi của các buổi đã xác nhận được liệt kê (sau modal "Áp giá mới cho N buổi?") */
  async apply(actor: AuthUser, rateId: string, body: ApplyToSessionsBody): Promise<ApplyToSessionsResponse> {
    const rate = await this.repo.findRate(rateId);
    if (!rate) throw notFound('extraRateNotFound');
    await this.assertRateScope(actor, rate);
    const updated = await this.sync.applyRate(rate, body.sessionIds);
    if (updated.length) {
      await this.audit.record(actor, 'extraRate.reprice', 'ExtraRate', rateId, null, { sessionIds: updated });
    }
    return { updated };
  }

  /** Cùng luật như lúc đặt giá */
  private async assertRateScope(actor: AuthUser, rate: RateScope): Promise<void> {
    if (rate.slotId) {
      await this.access.assertSlotAccess(actor, rate.slotId);
      if (rate.studentId) await this.access.assertStudentAccess(actor, rate.studentId);
      return;
    }
    if (rate.studentId) {
      await this.access.assertStudentAccess(actor, rate.studentId);
      if (!(await this.access.canSetStudentRate(actor, rate.studentId, this.slots.today()))) {
        throw new AppError('RATE_SCOPE_FORBIDDEN', 403);
      }
    }
  }

  private async assertStudent(user: AuthUser, studentId: string): Promise<void> {
    if (!(await this.repo.findStudent(studentId))) throw notFound('studentNotFound');
    await this.access.assertStudentAccess(user, studentId);
  }
}
