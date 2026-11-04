import { Injectable, Logger } from '@nestjs/common';
import { type AffectedRecord, type AffectedSession, BILLING_POLICY } from '@phonics/contracts';
import { EXTRA_LESSONS } from '@/config/constants';
import { dayjs } from '@/core/time/dayjs';
import { TimeService } from '@/core/time/time.service';
import { type Tx } from '@/database/types';
import { AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { resolveRate } from '@/modules/extra-lessons/utils/rate';
import { expectedInSession, rosterChange } from '@/modules/extra-lessons/utils/roster';
import { hasPassed, recentDates, sessionTimes } from '@/modules/extra-lessons/utils/session-time';

/** Đơn giá mới (vừa tạo) dùng để tính lại bản ghi điểm danh */
export interface RateScope {
  id: string;
  studentId: string | null;
  slotId: string | null;
  effectiveFrom: string;
}

type SessionWithStudent = Awaited<ReturnType<AttendanceRepository['sessionsForStudent']>>[number];

/**
 * Giữ buổi điểm danh khớp với lịch và đơn giá (§5.1, §6):
 * - 00:05 tạo buổi của ngày (idempotent theo (ca, ngày)), danh sách = học sinh theo lịch, mặc định có mặt, chốt giá;
 * - sửa lịch học sinh → buổi PENDING tự thêm / bỏ học sinh, buổi CONFIRMED trả về để người dùng chọn áp dụng;
 * - đặt giá mới → bản ghi buổi PENDING tự tính lại, buổi CONFIRMED trả về kèm chênh lệch.
 */
@Injectable()
export class SessionSyncService {
  private readonly logger = new Logger(SessionSyncService.name);

  constructor(
    private readonly repo: AttendanceRepository,
    private readonly schedule: ExtraScheduleRepository,
    private readonly time: TimeService,
  ) {}

  /** Tạo buổi còn thiếu của hôm nay (đã qua 00:05) và `catchUpDays` ngày trước — trả số buổi tạo mới */
  async ensureSessions(now: Date): Promise<number> {
    const today = this.time.toIsoDate(now);
    let created = 0;
    for (const date of recentDates(today, EXTRA_LESSONS.catchUpDays)) {
      if (!hasPassed(now, date, EXTRA_LESSONS.sessionTime, this.time.timeZone)) continue;
      // Ca tạo sau ngày đó không có buổi của ngày đó
      const endOfDate = dayjs.tz(date, this.time.timeZone).add(1, 'day').toDate();
      const slots = await this.repo.slotsOn(date, endOfDate);
      const existing = await this.repo.existingSlotDates(
        slots.map((s) => s.id),
        [date],
      );
      for (const slot of slots) {
        if (existing.has(`${slot.id}:${date}`)) continue;
        if (await this.createSlotSession(slot, date)) created += 1;
      }
    }
    if (created) this.logger.log(`Đã tạo ${created} buổi học thêm`);
    return created;
  }

  /**
   * Sau khi sửa lịch của học sinh trên các ca `slotIds` trong khoảng [from, to): đồng bộ buổi PENDING, trả buổi
   * CONFIRMED đang lệch.
   */
  async syncStudent(
    studentId: string,
    slotIds: readonly string[],
    from: string,
    to: string | null,
  ): Promise<AffectedSession[]> {
    const sessions = await this.repo.sessionsForStudent(studentId, slotIds, from, to);
    return (await this.reconcile(studentId, sessions, 'PENDING')).affected;
  }

  /** Áp lịch hiện tại vào các buổi được chọn (kể cả đã xác nhận) — trả id buổi đã sửa */
  async applyStudent(studentId: string, sessionIds: readonly string[]): Promise<string[]> {
    const sessions = await this.repo.findSessionsWithStudent(sessionIds, studentId);
    return (await this.reconcile(studentId, sessions, 'ALL')).applied;
  }

  /** Sau khi đặt giá mới: tính lại bản ghi buổi PENDING, trả bản ghi buổi CONFIRMED có giá khác */
  async repriceForRate(rate: RateScope): Promise<AffectedRecord[]> {
    const { changes } = await this.repriceChanges(rate);
    await this.writePrices(changes.filter((c) => c.status === 'PENDING'));
    return changes
      .filter((c) => c.status === 'CONFIRMED')
      .map((c) => ({
        sessionId: c.sessionId,
        studentId: c.studentId,
        date: c.date,
        oldPrice: c.oldPrice,
        newPrice: c.newPrice,
        charged: c.charged,
      }));
  }

  /** Áp giá hiện tại vào bản ghi của các buổi được chọn — trả id buổi đã sửa */
  async applyRate(rate: RateScope, sessionIds: readonly string[]): Promise<string[]> {
    const { changes } = await this.repriceChanges(rate);
    const picked = changes.filter((c) => sessionIds.includes(c.sessionId));
    await this.writePrices(picked);
    return [...new Set(picked.map((c) => c.sessionId))];
  }

  // ---- tạo buổi ----

  /**
   * Bản ghi chụp từ lịch học sinh của ca `slotId` ngày `date`: mặc định có mặt, chốt đơn giá. Dùng khi tạo buổi 00:05
   * và khi khôi phục buổi huỷ chưa có danh sách (buổi tạo sẵn ở trạng thái huỷ lúc nghỉ lễ).
   */
  async rosterRecords(slotId: string, date: string) {
    const studentIds = await this.repo.rosterOf(slotId, date);
    if (studentIds.length === 0) return [];
    const rates = await this.schedule.ratesFor(studentIds, [slotId]);
    return studentIds.map((studentId) => {
      const rate = resolveRate(rates, studentId, slotId, date);
      return {
        studentId,
        mark: 'PRESENT' as const,
        unitPrice: rate.pricePerSession,
        rateId: rate.rateId,
        charged: BILLING_POLICY.PRESENT,
        source: 'SNAPSHOT',
      };
    });
  }

  private async createSlotSession(
    slot: Awaited<ReturnType<AttendanceRepository['slotsOn']>>[number],
    date: string,
  ): Promise<boolean> {
    const records = await this.rosterRecords(slot.id, date);
    // Ca không còn học sinh nào hôm đó: không tạo buổi trống (cần thì GV tạo buổi bù)
    if (records.length === 0) return false;
    try {
      await this.repo.transaction((tx) =>
        this.repo.createSession(tx, {
          slotId: slot.id,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          ...sessionTimes(date, slot.startTime, slot.endTime, this.time.timeZone),
          teacherIds: slot.teachers.map((t) => t.teacherId),
          kind: slot.kind,
          presentCount: records.length,
          records: { createMany: { data: records } },
        }),
      );
      return true;
    } catch (err) {
      // Hai tiến trình cùng tạo (unique (slot_id, date)) → bên sau bỏ qua
      if ((err as { code?: string }).code === 'P2002') return false;
      throw err;
    }
  }

  // ---- lịch ----

  /**
   * So danh sách từng buổi với lịch hiện tại của học sinh. `apply = 'PENDING'`: chỉ sửa buổi PENDING, trả buổi
   * CONFIRMED lệch; `'ALL'`: sửa mọi buổi được truyền. `applied` = id buổi đã sửa.
   */
  private async reconcile(
    studentId: string,
    sessions: readonly SessionWithStudent[],
    apply: 'PENDING' | 'ALL',
  ): Promise<{ affected: AffectedSession[]; applied: string[] }> {
    if (!sessions.length) return { affected: [], applied: [] };
    const [assignments, student] = await Promise.all([
      this.schedule.assignmentsOf(studentId),
      this.schedule.findStudent(studentId),
    ]);
    const active = student?.status === 'ACTIVE';
    const affected: AffectedSession[] = [];
    const work: { session: SessionWithStudent; change: 'ADD' | 'REMOVE' }[] = [];
    for (const session of sessions) {
      const change = rosterChange(
        active && expectedInSession(assignments, session.slotId, session.date),
        session.records[0],
      );
      if (!change) continue;
      if (apply === 'ALL' || session.status === 'PENDING') work.push({ session, change });
      else
        affected.push({
          sessionId: session.id,
          date: session.date,
          slotName: session.slot?.name ?? null,
          change,
        });
    }
    if (work.length) {
      const rates = await this.schedule.ratesFor(
        [studentId],
        work.flatMap((w) => (w.session.slotId ? [w.session.slotId] : [])),
      );
      await this.repo.transaction(async (tx) => {
        for (const { session, change } of work) await this.applyChange(tx, session, studentId, change, rates);
      });
    }
    return { affected, applied: work.map((w) => w.session.id) };
  }

  private async applyChange(
    tx: Tx,
    session: SessionWithStudent,
    studentId: string,
    change: 'ADD' | 'REMOVE',
    rates: Awaited<ReturnType<ExtraScheduleRepository['ratesFor']>>,
  ): Promise<void> {
    if (change === 'ADD') {
      const rate = resolveRate(rates, studentId, session.slotId, session.date);
      await this.repo.upsertRecord(
        tx,
        session.id,
        studentId,
        {
          mark: 'PRESENT',
          unitPrice: rate.pricePerSession,
          rateId: rate.rateId,
          charged: BILLING_POLICY.PRESENT,
          source: 'SNAPSHOT',
        },
        {},
      );
    } else {
      await this.repo.deleteRecords(tx, session.id, [studentId], 'SNAPSHOT');
    }
    await this.repo.touchSession(tx, session.id);
  }

  // ---- giá ----

  /** Bản ghi trong phạm vi giá mới có đơn giá / dòng giá khác kết quả giải giá hiện tại */
  private async repriceChanges(rate: RateScope) {
    const records = await this.repo.recordsForReprice({
      ...(rate.studentId ? { studentId: rate.studentId } : {}),
      session: {
        date: { gte: rate.effectiveFrom },
        ...(rate.slotId ? { slotId: rate.slotId } : {}),
      },
    });
    const rates = await this.schedule.ratesFor(
      [...new Set(records.map((r) => r.studentId))],
      [...new Set(records.flatMap((r) => (r.session.slotId ? [r.session.slotId] : [])))],
    );
    const changes = records.flatMap((r) => {
      const next = resolveRate(rates, r.studentId, r.session.slotId, r.session.date);
      if (next.pricePerSession === r.unitPrice && next.rateId === r.rateId) return [];
      return [
        {
          sessionId: r.sessionId,
          studentId: r.studentId,
          date: r.session.date,
          status: r.session.status,
          charged: r.charged,
          oldPrice: r.unitPrice,
          newPrice: next.pricePerSession,
          rateId: next.rateId,
        },
      ];
    });
    return { changes };
  }

  private async writePrices(
    changes: readonly { sessionId: string; studentId: string; newPrice: number; rateId: string | null }[],
  ): Promise<void> {
    if (!changes.length) return;
    await this.repo.transaction(async (tx) => {
      for (const c of changes) {
        await this.repo.updateRecord(tx, c.sessionId, c.studentId, {
          unitPrice: c.newPrice,
          rateId: c.rateId,
        });
      }
      for (const id of new Set(changes.map((c) => c.sessionId))) await this.repo.touchSession(tx, id);
    });
  }
}
