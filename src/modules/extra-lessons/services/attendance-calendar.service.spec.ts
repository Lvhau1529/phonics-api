import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type TimeService } from '@/core/time/time.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { AttendanceCalendarService } from '@/modules/extra-lessons/services/attendance-calendar.service';
import { type AttendanceReaderService } from '@/modules/extra-lessons/services/attendance-reader.service';
import { type ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };
const TODAY = '2026-11-18'; // Thứ Tư

const slot = {
  id: 'fri',
  name: 'Ca T6',
  kind: 'EXTRA_CLASS' as const,
  weekday: 5,
  startTime: '18:00',
  endTime: '19:30',
  startsOn: null,
  endsOn: null,
  archivedAt: null,
  teachers: [{ teacher: { id: 't1', displayName: 'Cô Lan', email: 'lan@x.vn', avatarKey: 'a1' } }],
};

function setup() {
  const repo = mockDeep<AttendanceRepository>();
  const reader = mockDeep<AttendanceReaderService>();
  const access = mockDeep<ExtraAccessService>();
  const time = { toIsoDate: () => TODAY } as unknown as TimeService;
  const service = new AttendanceCalendarService(repo, reader, access, time);
  reader.scopeWhere.mockResolvedValue({});
  repo.calendarSessions.mockResolvedValue([]);
  reader.toSummaries.mockResolvedValue([
    { id: 's1', date: '2026-11-13', startTime: '18:00', endTime: '19:30' } as never,
  ]);
  access.slotScope.mockResolvedValue(['fri']);
  repo.calendarSlots.mockResolvedValue([slot] as never);
  repo.calendarAssignments.mockResolvedValue([
    { slotId: 'fri', studentId: 'a', effectiveFrom: '2026-09-01', effectiveTo: null },
    { slotId: 'fri', studentId: 'b', effectiveFrom: '2026-11-15', effectiveTo: '2026-11-28' },
  ]);
  repo.existingSlotDates.mockResolvedValue(new Set());
  return { repo, reader, access, service };
}

describe('AttendanceCalendarService.calendar', () => {
  it('buổi thật + buổi dự kiến từ hôm nay, theo phạm vi ca của GV, sắp theo ngày', async () => {
    const { repo, service } = setup();
    const res = await service.calendar(teacher, { from: '2026-11-09', to: '2026-11-29' });
    expect(repo.calendarSlots).toHaveBeenCalledWith({
      slotIds: ['fri'],
      slotId: undefined,
      teacherId: undefined,
    });
    // Chỉ xét ngày từ hôm nay
    expect(repo.calendarAssignments).toHaveBeenCalledWith(['fri'], TODAY, '2026-11-29');
    expect(res.today).toBe(TODAY);
    expect(res.items.map((i) => [i.type, i.date])).toEqual([
      ['SESSION', '2026-11-13'],
      ['PLANNED', '2026-11-20'],
      ['PLANNED', '2026-11-27'],
    ]);
    expect(res.items[1]).toMatchObject({
      slot: { id: 'fri', name: 'Ca T6' },
      teachers: [{ id: 't1', displayName: 'Cô Lan' }],
      studentCount: 2,
      limitedCount: 1,
    });
  });

  it('lọc trạng thái hoặc khoảng toàn quá khứ → không tính buổi dự kiến', async () => {
    const { repo, service } = setup();
    await service.calendar(teacher, { from: '2026-11-01', to: '2026-11-29', status: 'PENDING' });
    await service.calendar(teacher, { from: '2026-11-01', to: '2026-11-17' });
    expect(repo.calendarSlots).not.toHaveBeenCalled();
  });
});
