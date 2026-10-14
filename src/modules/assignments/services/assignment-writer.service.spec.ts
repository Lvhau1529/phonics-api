import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type AccessService } from '@/core/access/access.service';
import { type PrismaService } from '@/database/prisma.service';
import { type TimeService } from '@/core/time/time.service';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type MediaService } from '@/modules/media/services/media.service';
import { type NotificationsService } from '@/modules/notifications/services/notifications.service';
import { type WorksheetReaderService } from '@/modules/worksheets/services/worksheet-reader.service';
import { AssignmentRepository } from '@/modules/assignments/repositories/assignment.repository';
import { type AssignmentsScheduler } from '@/modules/assignments/jobs/assignments.scheduler';
import { dateOnly } from '@/modules/assignments/utils/assignment-dates';
import { AssignmentLifecycleService } from '@/modules/assignments/services/assignment-lifecycle.service';
import { type AssignmentRankingService } from '@/modules/assignments/services/assignment-ranking.service';
import { AssignmentReaderService } from '@/modules/assignments/services/assignment-reader.service';
import { AssignmentWriterService } from '@/modules/assignments/services/assignment-writer.service';

const M = '11111111-1111-4111-8111-111111111111';
const CLASS = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const teacher: AuthUser = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  role: 'TEACHER',
  status: 'ACTIVE',
  tokenVersion: 0,
};

const source = {
  id: WS,
  title: 'Letter Nn — D3',
  subject: 'PHONICS' as const,
  topic: 'Letter Nn',
  grade: 'K',
  week: 9,
  day: 3,
  kind: 'WORKSHEET' as const,
  status: 'PUBLISHED',
  sections: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      order: 0,
      title: 'Part 1',
      instruction: null,
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          order: 0,
          pointsOverride: null,
          question: {
            id: '66666666-6666-4666-8666-666666666666',
            type: 'MULTIPLE_CHOICE' as const,
            instruction: 'Circle the correct word.',
            instructionVi: null,
            points: 2,
            example: null,
            config: {
              type: 'MULTIPLE_CHOICE',
              imageMediaId: M,
              options: [
                { id: 'a', text: 'jam' },
                { id: 'b', text: 'ram' },
              ],
            },
            answerKey: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
          },
        },
      ],
    },
  ],
};

function setup() {
  const prisma = mockDeep<PrismaService>();
  const access = mockDeep<AccessService>();
  const audit = mockDeep<AuditService>();
  const time = mockDeep<TimeService>();
  const media = mockDeep<MediaService>();
  const notifications = mockDeep<NotificationsService>();
  const worksheets = mockDeep<WorksheetReaderService>();
  const ranking = mockDeep<AssignmentRankingService>();
  access.assertClassAccess.mockResolvedValue(undefined);
  media.hydrate.mockResolvedValue({});
  time.fromIsoDate.mockImplementation((iso: string) => new Date(`${iso}T00:00:00.000Z`));
  time.toIsoDate.mockImplementation((d: Date) => d.toISOString().slice(0, 10));
  worksheets.loadForSnapshot.mockResolvedValue(source as never);
  // $transaction(fn) → chạy fn với chính prisma mock
  prisma.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  prisma.$queryRaw.mockResolvedValue([] as never);
  // Repository thật bọc Prisma mock: assert trên lời gọi Prisma như trước khi tách service
  const repo = new AssignmentRepository(prisma);
  const reader = new AssignmentReaderService(repo, access, time, media, ranking);
  const lifecycle = new AssignmentLifecycleService(repo, time, notifications);
  const scheduler = mockDeep<AssignmentsScheduler>();
  const service = new AssignmentWriterService(
    repo,
    reader,
    lifecycle,
    access,
    audit,
    time,
    worksheets,
    scheduler,
  );
  return { prisma, access, audit, notifications, worksheets, scheduler, service };
}

const createdRow = (status: 'OPEN' | 'SCHEDULED') => ({
  id: '77777777-7777-4777-8777-777777777777',
  worksheetId: WS,
  classId: CLASS,
  assignedById: teacher.id,
  scheduledFor: dateOnly('2026-10-09'),
  availableFrom: new Date('2026-10-08T17:00:00.000Z'),
  dueAt: null,
  allowLate: false,
  maxAttempts: 1,
  showAnswersAfterSubmit: false,
  status,
  snapshot: {},
  maxScore: 2,
  hasManualItems: false,
  openedAt: null,
  closedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  worksheet: { title: source.title, subject: 'PHONICS', topic: 'Letter Nn', kind: 'WORKSHEET' },
  class: { name: 'K2A' },
  assignedBy: { displayName: 'Cô Lan' },
});

describe('AssignmentWriterService.create', () => {
  it('worksheet chưa publish → WORKSHEET_NOT_PUBLISHED', async () => {
    const { worksheets, service } = setup();
    worksheets.loadForSnapshot.mockResolvedValue({ ...source, status: 'DRAFT' } as never);
    await expect(
      service.create(teacher, {
        worksheetId: WS,
        classId: CLASS,
        scheduledFor: '2026-10-09',
        allowLate: false,
        maxAttempts: 1,
        showAnswersAfterSubmit: false,
      }),
    ).rejects.toMatchObject({ code: 'WORKSHEET_NOT_PUBLISHED' });
  });

  it('availableFrom trong quá khứ → OPEN ngay + thông báo cả lớp; snapshot có answerKey', async () => {
    const { prisma, notifications, audit, service } = setup();
    prisma.assignment.create.mockResolvedValue(createdRow('OPEN') as never);
    prisma.classMembership.findMany.mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }] as never);
    await service.create(teacher, {
      worksheetId: WS,
      classId: CLASS,
      scheduledFor: '2026-10-09',
      availableFrom: '2020-01-01T00:00:00.000Z',
      allowLate: false,
      maxAttempts: 1,
      showAnswersAfterSubmit: false,
    });
    const data = prisma.assignment.create.mock.calls[0][0].data as {
      status: string;
      maxScore: number;
      hasManualItems: boolean;
      snapshot: { sections: { items: { question: { answerKey: unknown } }[] }[] };
    };
    expect(data.status).toBe('OPEN');
    expect(data.maxScore).toBe(2);
    expect(data.hasManualItems).toBe(false);
    expect(data.snapshot.sections[0].items[0].question.answerKey).toEqual({
      type: 'MULTIPLE_CHOICE',
      optionId: 'a',
    });
    expect(notifications.createMany).toHaveBeenCalledTimes(1);
    const inputs = notifications.createMany.mock.calls[0][0];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({ type: 'ASSIGNMENT_NEW', userId: 's1' });
    expect(audit.record).toHaveBeenCalledWith(
      teacher,
      'assignment.create',
      'Assignment',
      expect.any(String),
      null,
      expect.anything(),
    );
  });

  it('availableFrom tương lai → SCHEDULED, chưa thông báo', async () => {
    const { prisma, notifications, service } = setup();
    prisma.assignment.create.mockResolvedValue(createdRow('SCHEDULED') as never);
    await service.create(teacher, {
      worksheetId: WS,
      classId: CLASS,
      scheduledFor: '2099-01-01',
      allowLate: false,
      maxAttempts: 1,
      showAnswersAfterSubmit: false,
    });
    expect((prisma.assignment.create.mock.calls[0][0].data as { status: string }).status).toBe('SCHEDULED');
    expect(notifications.createMany).not.toHaveBeenCalled();
  });

  it('dueAt trước availableFrom → VALIDATION_ERROR', async () => {
    const { service } = setup();
    await expect(
      service.create(teacher, {
        worksheetId: WS,
        classId: CLASS,
        scheduledFor: '2026-10-09',
        availableFrom: '2026-10-09T02:00:00.000Z',
        dueAt: '2026-10-09T01:00:00.000Z',
        allowLate: false,
        maxAttempts: 1,
        showAnswersAfterSubmit: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
