import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type PrismaService } from '@/database/prisma.service';
import { AssignmentRepository } from '@/modules/assignments/repositories/assignment.repository';
import { AssignmentLifecycleService } from '@/modules/assignments/services/assignment-lifecycle.service';

function setup() {
  const prisma = mockDeep<PrismaService>();
  prisma.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  const service = new AssignmentLifecycleService(new AssignmentRepository(prisma));
  return { prisma, service };
}

describe('AssignmentLifecycleService.tick', () => {
  it('chỉ đếm bài mở khi updateMany đổi được đúng một dòng; đóng bài quá hạn', async () => {
    const { prisma, service } = setup();
    prisma.assignment.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }] as never);
    prisma.assignment.updateMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValueOnce({ count: 3 } as never);
    const r = await service.tick(new Date('2026-10-09T00:10:00Z'));
    expect(r).toEqual({ opened: 1, closed: 3 });
  });
});
