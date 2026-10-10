import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type AccessService } from '../../../core/access/access.service';
import { type PrismaService } from '../../../database/prisma.service';
import { type AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { type NotificationsService } from '../../notifications/services/notifications.service';
import { buildThread } from '../dto/responses/comment.view';
import { CommentsService } from './comments.service';

const SUB = '77777777-7777-4777-8777-777777777777';
const ITEM = '55555555-5555-4555-8555-555555555555';
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

const submissionRow = (status = 'SUBMITTED') => ({
  id: SUB,
  studentId: student.id,
  status,
  assignmentId: 'as1',
  assignment: {
    classId: 'c1',
    snapshot: { title: 'Letter Nn', sections: [{ items: [{ worksheetItemId: ITEM, question: {} }] }] },
  },
});

const author = (u: AuthUser, name: string) => ({ displayName: name, role: u.role, avatarKey: 'bunny' });
const commentRow = (over: Record<string, unknown>) => ({
  id: 'c-root',
  submissionId: SUB,
  worksheetItemId: ITEM,
  authorId: teacher.id,
  parentId: null,
  body: 'Great job!',
  createdAt: new Date('2026-10-09T00:00:00Z'),
  editedAt: null,
  deletedAt: null,
  author: author(teacher, 'Cô Lan'),
  ...over,
});

function setup() {
  const prisma = mockDeep<PrismaService>();
  const access = mockDeep<AccessService>();
  const audit = mockDeep<AuditService>();
  const notifications = mockDeep<NotificationsService>();
  access.assertClassAccess.mockResolvedValue(undefined);
  prisma.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  const service = new CommentsService(prisma, access, audit, notifications);
  return { prisma, access, notifications, service };
}

describe('CommentsService', () => {
  it('buildThread: gom reply vào gốc, xoá mềm → body rỗng', () => {
    const rows = [
      commentRow({}),
      commentRow({
        id: 'c-reply',
        parentId: 'c-root',
        authorId: student.id,
        author: author(student, 'Bé Na'),
        body: 'Thank you',
      }),
      commentRow({ id: 'c-del', deletedAt: new Date() }),
    ];
    const thread = buildThread(rows as never);
    expect(thread).toHaveLength(2);
    expect(thread[0].replies[0].body).toBe('Thank you');
    expect(thread[1]).toMatchObject({ deleted: true, body: '' });
  });

  it('học sinh không được tạo nhận xét gốc', async () => {
    const { prisma, service } = setup();
    prisma.submission.findUnique.mockResolvedValue(submissionRow() as never);
    await expect(service.create(student, SUB, { body: 'hi' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('học sinh chỉ xem bài của mình', async () => {
    const { prisma, service } = setup();
    prisma.submission.findUnique.mockResolvedValue({
      ...submissionRow(),
      studentId: 'someone-else',
    } as never);
    await expect(service.list(student, SUB)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('GV nhận xét theo câu → thông báo học sinh; câu không có trong bài → 400', async () => {
    const { prisma, notifications, service } = setup();
    prisma.submission.findUnique.mockResolvedValue(submissionRow() as never);
    prisma.comment.create.mockResolvedValue(commentRow({}) as never);
    const view = await service.create(teacher, SUB, { body: 'Great job!', worksheetItemId: ITEM });
    expect(view.replies).toEqual([]);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: student.id, type: 'COMMENT_REPLY' }),
      prisma,
    );
    await expect(
      service.create(teacher, SUB, { body: 'x', worksheetItemId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('học sinh trả lời → gắn vào gốc, thông báo tác giả gốc', async () => {
    const { prisma, notifications, service } = setup();
    prisma.submission.findUnique.mockResolvedValue(submissionRow() as never);
    prisma.comment.findFirst.mockResolvedValue(commentRow({ id: 'c-reply', parentId: 'c-root' }) as never);
    prisma.comment.findUniqueOrThrow.mockResolvedValue(commentRow({}) as never);
    prisma.comment.create.mockResolvedValue(
      commentRow({
        id: 'c-new',
        parentId: 'c-root',
        authorId: student.id,
        author: author(student, 'Bé Na'),
        body: 'Thanks',
      }) as never,
    );
    await service.create(student, SUB, { body: 'Thanks', parentId: 'c-reply' });
    expect(prisma.comment.create.mock.calls[0][0].data).toMatchObject({
      parentId: 'c-root',
      worksheetItemId: ITEM,
    });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: teacher.id }),
      prisma,
    );
  });

  it('chỉ tác giả sửa; admin xoá được', async () => {
    const { prisma, service } = setup();
    prisma.comment.findUnique.mockResolvedValue(commentRow({}) as never);
    await expect(service.update(student, 'c-root', { body: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    await expect(service.remove(student, 'c-root')).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    const admin: AuthUser = { ...teacher, id: 'admin', role: 'ADMIN' };
    await service.remove(admin, 'c-root');
    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
  });
});
