import { Injectable } from '@nestjs/common';
import {
  type ExtraSlot,
  type ExtraSlotListQuery,
  type ExtraSlotsResponse,
  type SlotStudentsQuery,
  type SlotStudentsResponse,
} from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { TimeService } from '@/core/time/time.service';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toExtraSlot, toSlotStudent } from '@/modules/extra-lessons/dto/responses/extra.view';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { type SlotRow } from '@/modules/extra-lessons/types/extra.types';
import { resolveRate } from '@/modules/extra-lessons/utils/rate';
import { isActiveOn } from '@/modules/extra-lessons/utils/schedule';

/** Đọc ca học thêm: ADMIN mọi ca, GV ca mình dạy. Đơn giá chỉ hiện khi có extra.viewPricing. */
@Injectable()
export class ExtraSlotReaderService {
  constructor(
    private readonly repo: ExtraSlotRepository,
    private readonly schedule: ExtraScheduleRepository,
    private readonly access: ExtraAccessService,
    private readonly time: TimeService,
  ) {}

  async list(user: AuthUser, query: ExtraSlotListQuery): Promise<ExtraSlotsResponse> {
    const scope = await this.access.slotScope(user);
    const where: Prisma.ExtraSlotWhereInput = {
      id: scope ? { in: scope } : undefined,
      archivedAt: query.includeArchived === 'true' ? undefined : null,
      classId: query.classId,
      teachers: query.teacherId ? { some: { teacherId: query.teacherId } } : undefined,
    };
    return { items: await this.toViews(user, await this.repo.list(where)) };
  }

  async detail(user: AuthUser, id: string): Promise<ExtraSlot> {
    const row = await this.find(id);
    await this.access.assertSlotAccess(user, id);
    const [view] = await this.toViews(user, [row]);
    return view;
  }

  async students(user: AuthUser, id: string, query: SlotStudentsQuery): Promise<SlotStudentsResponse> {
    await this.find(id);
    await this.access.assertSlotAccess(user, id);
    const date = query.date ?? this.today();
    const rows = await this.repo.studentsOn(id, date);
    const rates = (await this.access.has(user, 'extra.viewPricing'))
      ? await this.schedule.ratesFor(
          rows.map((r) => r.studentId),
          [id],
        )
      : null;
    return {
      date,
      items: rows.map((r) => toSlotStudent(r, rates && resolveRate(rates, r.studentId, id, date))),
    };
  }

  async find(id: string): Promise<SlotRow> {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('extraSlotNotFound');
    return row;
  }

  /** Số học sinh hôm nay + giá mặc định đang áp dụng (một truy vấn cho cả danh sách) */
  async toViews(user: AuthUser, rows: readonly SlotRow[]): Promise<ExtraSlot[]> {
    const today = this.today();
    const ids = rows.map((r) => r.id);
    const [counts, rates] = await Promise.all([
      this.repo.countStudentsOn(ids, today),
      this.access.has(user, 'extra.viewPricing').then((ok) => (ok ? this.schedule.ratesFor([], ids) : null)),
    ]);
    return rows.map((row) => {
      const price = rates?.find(
        (r) => r.slotId === row.id && isActiveOn({ from: r.effectiveFrom, to: r.effectiveTo }, today),
      );
      return toExtraSlot(row, counts.get(row.id) ?? 0, price?.pricePerSession ?? null);
    });
  }

  today(): string {
    return this.time.toIsoDate(new Date());
  }
}
