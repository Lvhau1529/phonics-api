import { Injectable } from '@nestjs/common';
import {
  type AttendanceCalendarQuery,
  type AttendanceCalendarResponse,
  type CalendarItem,
} from '@phonics/contracts';
import { TimeService } from '@/core/time/time.service';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toSlotRef, toTeacherRef } from '@/modules/extra-lessons/dto/responses/extra.view';
import { AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { AttendanceReaderService } from '@/modules/extra-lessons/services/attendance-reader.service';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { plannedOccurrences } from '@/modules/extra-lessons/utils/calendar';
import { datesBetween } from '@/modules/extra-lessons/utils/session-time';

/**
 * Lịch buổi học (docs/attendance-calendar-design.md §3): buổi thật trong khoảng + buổi dự kiến (ngày ≥ hôm nay, ca có
 * học sinh theo lịch nhưng chưa tạo buổi). Phạm vi như danh sách buổi: ADMIN mọi ca, GV ca / buổi mình.
 */
@Injectable()
export class AttendanceCalendarService {
  constructor(
    private readonly repo: AttendanceRepository,
    private readonly reader: AttendanceReaderService,
    private readonly access: ExtraAccessService,
    private readonly time: TimeService,
  ) {}

  async calendar(user: AuthUser, query: AttendanceCalendarQuery): Promise<AttendanceCalendarResponse> {
    const today = this.time.toIsoDate(new Date());
    const where: Prisma.AttendanceSessionWhereInput = {
      AND: [
        await this.reader.scopeWhere(user),
        {
          slotId: query.slotId,
          status: query.status,
          teacherIds: query.teacherId ? { has: query.teacherId } : undefined,
          date: { gte: query.from, lte: query.to },
        },
      ],
    };
    const sessions = await this.reader.toSummaries(await this.repo.calendarSessions(where));
    const items: CalendarItem[] = sessions.map((session) => ({
      type: 'SESSION',
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      session,
    }));

    // Buổi dự kiến: không có trạng thái → bỏ khi lọc theo trạng thái; ngày đã qua chỉ có buổi thật
    const start = query.from > today ? query.from : today;
    if (!query.status && start <= query.to) items.push(...(await this.planned(user, query, start)));

    items.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    return { from: query.from, to: query.to, today, items };
  }

  private async planned(
    user: AuthUser,
    query: AttendanceCalendarQuery,
    from: string,
  ): Promise<CalendarItem[]> {
    const scope = await this.access.slotScope(user);
    const slots = await this.repo.calendarSlots({
      slotIds: scope,
      slotId: query.slotId,
      teacherId: query.teacherId,
    });
    if (!slots.length) return [];
    const dates = datesBetween(from, query.to);
    const slotIds = slots.map((s) => s.id);
    const [assignments, existing] = await Promise.all([
      this.repo.calendarAssignments(slotIds, from, query.to),
      // Mọi buổi thật (không theo phạm vi GV) — ca đã có buổi ngày đó thì không dự kiến nữa
      this.repo.existingSlotDates(slotIds, dates),
    ]);
    const byId = new Map(slots.map((s) => [s.id, s]));
    return plannedOccurrences(dates, slots, assignments, existing).map((p) => {
      const slot = byId.get(p.slotId)!;
      return {
        type: 'PLANNED',
        date: p.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        slot: toSlotRef(slot),
        teachers: slot.teachers.map(({ teacher }) => toTeacherRef(teacher)),
        studentCount: p.studentCount,
        limitedCount: p.limitedCount,
      };
    });
  }
}
