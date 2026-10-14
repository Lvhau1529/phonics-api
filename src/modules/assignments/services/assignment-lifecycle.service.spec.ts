import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type TimeService } from '@/core/time/time.service';
import { type PrismaService } from '@/database/prisma.service';
import { type NotificationsService } from '@/modules/notifications/services/notifications.service';
import { AssignmentRepository } from '@/modules/assignments/repositories/assignment.repository';
import { dateOnly } from '@/modules/assignments/utils/assignment-dates';
import { AssignmentLifecycleService } from '@/modules/assignments/services/assignment-lifecycle.service';

const openRow = {
  id: '77777777-7777-4777-8777-777777777777',
  worksheetId: '33333333-3333-4333-8333-333333333333',
  classId: '22222222-2222-4222-8222-222222222222',
  assignedById: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  scheduledFor: dateOnly('2026-10-09'),
  availableFrom: new Date('2026-10-08T17:00:00.000Z'),
  dueAt: null,
  status: 'OPEN',
  worksheet: { title: 'Letter Nn — D3', subject: 'PHONICS', topic: 'Letter Nn', kind: 'WORKSHEET' },
  class: { name: 'K2A' },
  assignedBy: { displayName: 'Cô Lan' },
};

function setup() {
  const prisma = mockDeep<PrismaService>();
  const time = mockDeep<TimeService>();
  const notifications = mockDeep<NotificationsService>();
  time.toIsoDate.mockImplementation((d: Date) => d.toISOString().slice(0, 10));
  prisma.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  const service = new AssignmentLifecycleService(new AssignmentRepository(prisma), time, notifications);
  return { prisma, notifications, service };
}

describe('AssignmentLifecycleService.tick', () => {
  it('chỉ thông báo khi updateMany đổi được đúng một dòng', async () => {
    const { prisma, notifications, service } = setup();
    prisma.assignment.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }] as never);
    prisma.assignment.updateMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValueOnce({ count: 3 } as never);
    prisma.assignment.findUniqueOrThrow.mockResolvedValue(openRow as never);
    prisma.classMembership.findMany.mockResolvedValue([{ studentId: 's1' }] as never);
    const r = await service.tick(new Date('2026-10-09T00:10:00Z'));
    expect(r).toEqual({ opened: 1, closed: 3 });
    expect(notifications.createMany).toHaveBeenCalledTimes(1);
  });
});
