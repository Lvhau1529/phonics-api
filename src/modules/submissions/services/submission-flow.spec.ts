import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type AccessService } from '../../../core/access/access.service';
import { type PrismaService } from '../../../database/prisma.service';
import { type AssignmentRankingService } from '../../assignments/services/assignment-ranking.service';
import { type AssignmentStudentService } from '../../assignments/services/assignment-student.service';
import { type AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { type MediaService } from '../../media/services/media.service';
import { type NotificationsService } from '../../notifications/services/notifications.service';
import { SubmissionRepository } from '../repositories/submission.repository';
import { SubmissionGradingService } from './submission-grading.service';
import { SubmissionReaderService } from './submission-reader.service';
import { SubmissionStudentService } from './submission-student.service';

const M = '11111111-1111-4111-8111-111111111111';
const ITEM_MC = '55555555-5555-4555-8555-555555555555';
const ITEM_SPEAK = '66666666-6666-4666-8666-666666666666';
const SUB = '77777777-7777-4777-8777-777777777777';
const ASSIGN = '88888888-8888-4888-8888-888888888888';
const student: AuthUser = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: 'STUDENT',
  status: 'ACTIVE',
  tokenVersion: 0,
};
const teacher: AuthUser = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  role: 'TEACHER',
  status: 'ACTIVE',
  tokenVersion: 0,
};

const snapshot = {
  worksheetId: '33333333-3333-4333-8333-333333333333',
  title: 'Letter Nn — D3',
  subject: 'PHONICS',
  topic: null,
  grade: null,
  week: null,
  day: null,
  kind: 'WORKSHEET',
  maxScore: 3,
  snapshotAt: '2026-10-09T00:00:00.000Z',
  sections: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      order: 0,
      title: 'Part 1',
      instruction: null,
      items: [
        {
          worksheetItemId: ITEM_MC,
          order: 0,
          points: 1,
          question: {
            id: 'q1',
            type: 'MULTIPLE_CHOICE',
            gradingMode: 'AUTO',
            instruction: 'Circle.',
            instructionVi: null,
            example: null,
            config: {
              type: 'MULTIPLE_CHOICE',
              options: [
                { id: 'a', text: 'jam' },
                { id: 'b', text: 'ram' },
              ],
            },
            answerKey: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
          },
        },
        {
          worksheetItemId: ITEM_SPEAK,
          order: 1,
          points: 2,
          question: {
            id: 'q2',
            type: 'SPEAK',
            gradingMode: 'MANUAL',
            instruction: 'Say the word.',
            instructionVi: null,
            example: null,
            config: { type: 'SPEAK', prompt: 'Say: jam' },
            answerKey: { type: 'SPEAK' },
          },
        },
      ],
    },
  ],
};

const assignment = (over: Partial<{ hasManualItems: boolean; dueAt: Date | null; status: string }> = {}) => ({
  id: ASSIGN,
  classId: '22222222-2222-4222-8222-222222222222',
  status: 'OPEN',
  availableFrom: new Date('2026-10-01T00:00:00Z'),
  dueAt: null,
  allowLate: false,
  maxAttempts: 1,
  showAnswersAfterSubmit: true,
  snapshot,
  maxScore: 3,
  hasManualItems: true,
  ...over,
});

const submission = (over: Record<string, unknown> = {}) => ({
  id: SUB,
  assignmentId: ASSIGN,
  studentId: student.id,
  attemptNo: 1,
  status: 'IN_PROGRESS',
  startedAt: new Date('2026-10-09T01:00:00Z'),
  submittedAt: null,
  gradedAt: null,
  gradedById: null,
  autoScore: 0,
  manualScore: null,
  totalScore: null,
  maxScore: 3,
  durationMs: null,
  late: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  student: { user: { displayName: 'Bé Na' } },
  gradedBy: null,
  answers: [] as unknown[],
  assignment: assignment(),
  ...over,
});

function setup() {
  const prisma = mockDeep<PrismaService>();
  const access = mockDeep<AccessService>();
  const audit = mockDeep<AuditService>();
  const media = mockDeep<MediaService>();
  const notifications = mockDeep<NotificationsService>();
  const assignments = mockDeep<AssignmentStudentService>();
  const ranking = mockDeep<AssignmentRankingService>();
  access.assertClassAccess.mockResolvedValue(undefined);
  media.hydrate.mockResolvedValue({});
  media.assertOwnedReady.mockResolvedValue(undefined);
  prisma.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  prisma.$executeRaw.mockResolvedValue(0 as never);
  // Repository thật bọc Prisma mock: assert trên lời gọi Prisma như trước khi tách thành nhiều class
  const repo = new SubmissionRepository(prisma);
  const reader = new SubmissionReaderService(repo, access, media);
  const attempts = new SubmissionStudentService(repo, reader, media, assignments, ranking);
  const grading = new SubmissionGradingService(repo, reader, audit, notifications);
  return { prisma, audit, media, notifications, assignments, ranking, reader, attempts, grading };
}

describe('Bài nộp: học sinh làm / nộp, giáo viên chấm', () => {
  it('start: tái dùng attempt đang làm (200), hết lượt → ATTEMPTS_EXHAUSTED', async () => {
    const { prisma, assignments, attempts } = setup();
    assignments.loadForStudent.mockResolvedValue(assignment() as never);
    prisma.submission.findFirst.mockResolvedValueOnce(submission() as never);
    const reused = await attempts.start(student, ASSIGN);
    expect(reused.created).toBe(false);

    prisma.submission.findFirst.mockResolvedValueOnce(null);
    prisma.submission.count.mockResolvedValue(1);
    await expect(attempts.start(student, ASSIGN)).rejects.toMatchObject({ code: 'ATTEMPTS_EXHAUSTED' });
  });

  it('start: bài chưa mở → ASSIGNMENT_NOT_OPEN', async () => {
    const { assignments, attempts } = setup();
    assignments.loadForStudent.mockResolvedValue(assignment({ status: 'CLOSED' }) as never);
    await expect(attempts.start(student, ASSIGN)).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_OPEN' });
  });

  it('saveAnswers: sai dạng → ANSWER_TYPE_MISMATCH; đúng → upsert + kiểm media', async () => {
    const { prisma, media, attempts } = setup();
    prisma.submission.findFirst.mockResolvedValue(submission() as never);
    await expect(
      attempts.saveAnswers(student, SUB, {
        answers: [{ worksheetItemId: ITEM_MC, answer: { type: 'SPEAK', recordingMediaId: M } }],
      }),
    ).rejects.toMatchObject({ code: 'ANSWER_TYPE_MISMATCH', details: { worksheetItemId: [ITEM_MC] } });

    prisma.submission.update.mockResolvedValue({ updatedAt: new Date('2026-10-09T01:05:00Z') } as never);
    const r = await attempts.saveAnswers(student, SUB, {
      answers: [
        { worksheetItemId: ITEM_MC, answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' } },
        { worksheetItemId: ITEM_SPEAK, answer: { type: 'SPEAK', recordingMediaId: M } },
      ],
    });
    expect(r.saved).toBe(2);
    expect(media.assertOwnedReady).toHaveBeenCalledWith([M], student);
    expect(prisma.submissionAnswer.upsert).toHaveBeenCalledTimes(2);
  });

  it('saveAnswers: bài đã nộp → SUBMISSION_NOT_EDITABLE', async () => {
    const { prisma, attempts } = setup();
    prisma.submission.findFirst.mockResolvedValue(submission({ status: 'SUBMITTED' }) as never);
    await expect(
      attempts.saveAnswers(student, SUB, {
        answers: [{ worksheetItemId: ITEM_MC, answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' } }],
      }),
    ).rejects.toMatchObject({
      code: 'SUBMISSION_NOT_EDITABLE',
    });
  });

  it('submit: chấm câu AUTO, SUBMITTED khi có câu chấm tay, tạo dòng trống cho câu chưa trả lời', async () => {
    const { prisma, ranking, attempts } = setup();
    prisma.submission.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.submission.findUniqueOrThrow.mockResolvedValue(
      submission({
        answers: [
          { id: 'ans1', worksheetItemId: ITEM_MC, answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' } },
        ],
      }) as never,
    );
    prisma.submission.update.mockImplementation((async (args: { data: Record<string, unknown> }) =>
      submission({ ...args.data, status: args.data.status })) as never);
    const r = await attempts.submit(student, SUB);
    expect(prisma.submissionAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isCorrect: true, autoScore: 1 }) }),
    );
    expect(prisma.submissionAnswer.create).toHaveBeenCalledTimes(1); // câu SPEAK chưa có dòng
    const data = prisma.submission.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ status: 'SUBMITTED', autoScore: 1, totalScore: null, late: false });
    expect(r.rank).toBeNull();
    expect(ranking.rankOf).not.toHaveBeenCalled();
  });

  it('submit: không có câu chấm tay → GRADED + hạng; quá hạn → late', async () => {
    const { prisma, ranking, attempts } = setup();
    prisma.submission.updateMany.mockResolvedValue({ count: 1 } as never);
    const a = assignment({ hasManualItems: false, dueAt: new Date('2020-01-01T00:00:00Z') });
    a.allowLate = true;
    prisma.submission.findUniqueOrThrow.mockResolvedValue(
      submission({ assignment: a, answers: [] }) as never,
    );
    prisma.submission.update.mockImplementation((async (args: { data: Record<string, unknown> }) =>
      submission({ ...args.data, assignment: a })) as never);
    ranking.rankOf.mockResolvedValue({ rank: 1, members: 1 });
    const r = await attempts.submit(student, SUB);
    const data = prisma.submission.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ status: 'GRADED', autoScore: 0, totalScore: 0, late: true });
    expect(r.rank).toEqual({ rank: 1, members: 1 });
  });

  it('submit: đã nộp rồi → SUBMISSION_NOT_EDITABLE', async () => {
    const { prisma, attempts } = setup();
    prisma.submission.updateMany.mockResolvedValue({ count: 0 } as never);
    prisma.submission.findFirst.mockResolvedValue({ id: SUB } as never);
    await expect(attempts.submit(student, SUB)).rejects.toMatchObject({ code: 'SUBMISSION_NOT_EDITABLE' });
  });

  it('grade: finalize thiếu điểm câu chấm tay → GRADING_INCOMPLETE', async () => {
    const { prisma, grading } = setup();
    prisma.submission.findUnique.mockResolvedValue(submission({ status: 'SUBMITTED' }) as never);
    prisma.submissionAnswer.findMany.mockResolvedValue([
      { worksheetItemId: ITEM_MC, manualScore: null, autoScore: 1 },
    ] as never);
    await expect(grading.grade(teacher, SUB, { items: [], finalize: true })).rejects.toMatchObject({
      code: 'GRADING_INCOMPLETE',
      details: { worksheetItemId: [ITEM_SPEAK] },
    });
  });

  it('grade: finalize đủ điểm → GRADED, totalScore = manual ?? auto, thông báo một lần, audit', async () => {
    const { prisma, notifications, audit, grading } = setup();
    prisma.submission.findUnique.mockResolvedValue(
      submission({ status: 'SUBMITTED', autoScore: 1 }) as never,
    );
    prisma.submissionAnswer.findMany.mockResolvedValue([
      { worksheetItemId: ITEM_MC, manualScore: null, autoScore: 1 },
      { worksheetItemId: ITEM_SPEAK, manualScore: 1.5, autoScore: null },
    ] as never);
    prisma.submission.update.mockImplementation((async (args: { data: Record<string, unknown> }) =>
      submission({ status: 'GRADED', ...args.data })) as never);
    const detail = await grading.grade(teacher, SUB, {
      items: [{ worksheetItemId: ITEM_SPEAK, manualScore: 1.5, teacherNote: 'Good!' }],
      finalize: true,
    });
    const data = prisma.submission.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      status: 'GRADED',
      totalScore: 2.5,
      manualScore: 1.5,
      gradedById: teacher.id,
    });
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][0]).toMatchObject({
      type: 'SUBMISSION_GRADED',
      userId: student.id,
    });
    expect(audit.record).toHaveBeenCalledWith(
      teacher,
      'submission.grade',
      'Submission',
      SUB,
      expect.anything(),
      expect.anything(),
    );
    expect(detail.answers[1].answerKey).toEqual({ type: 'SPEAK' });
  });

  it('grade: điểm vượt tối đa → VALIDATION_ERROR; bài đang làm → SUBMISSION_NOT_SUBMITTED', async () => {
    const { prisma, grading } = setup();
    prisma.submission.findUnique.mockResolvedValueOnce(submission({ status: 'SUBMITTED' }) as never);
    await expect(
      grading.grade(teacher, SUB, {
        items: [{ worksheetItemId: ITEM_SPEAK, manualScore: 5 }],
        finalize: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    prisma.submission.findUnique.mockResolvedValueOnce(submission() as never);
    await expect(grading.grade(teacher, SUB, { items: [], finalize: false })).rejects.toMatchObject({
      code: 'SUBMISSION_NOT_SUBMITTED',
    });
  });

  it('getForStudent: ẩn answerKey khi chưa GRADED, hiện khi GRADED + showAnswersAfterSubmit', async () => {
    const { prisma, reader } = setup();
    prisma.submission.findFirst.mockResolvedValueOnce(submission({ status: 'SUBMITTED' }) as never);
    const hidden = await reader.getForStudent(student, SUB);
    expect(hidden.answers.every((a) => a.answerKey === null)).toBe(true);
    expect(
      (hidden.worksheet.sections[0].items[0].question as Record<string, unknown>).answerKey,
    ).toBeUndefined();

    prisma.submission.findFirst.mockResolvedValueOnce(submission({ status: 'GRADED' }) as never);
    const shown = await reader.getForStudent(student, SUB);
    expect(shown.answers[0].answerKey).toEqual({ type: 'MULTIPLE_CHOICE', optionId: 'a' });
    expect(shown.pendingManual).toBe(0);
  });
});
