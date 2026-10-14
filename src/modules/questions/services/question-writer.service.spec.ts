import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type PrismaService } from '@/database/prisma.service';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type MediaService } from '@/modules/media/services/media.service';
import { QuestionRepository } from '@/modules/questions/repositories/question.repository';
import { QuestionReaderService } from '@/modules/questions/services/question-reader.service';
import { QuestionWriterService } from '@/modules/questions/services/question-writer.service';

const M = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const teacher: AuthUser = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  role: 'TEACHER',
  status: 'ACTIVE',
  tokenVersion: 0,
};
const other: AuthUser = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  role: 'TEACHER',
  status: 'ACTIVE',
  tokenVersion: 0,
};

const row = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'MULTIPLE_CHOICE' as const,
  gradingMode: 'AUTO' as const,
  instruction: 'Circle the correct word.',
  instructionVi: null,
  points: 1,
  tags: ['nn'],
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
  status: 'DRAFT' as const,
  visibility: 'SHARED' as const,
  createdById: teacher.id,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  createdBy: { displayName: 'Cô Lan' },
  _count: { items: 0 },
};

function setup() {
  const prisma = mockDeep<PrismaService>();
  const audit = mockDeep<AuditService>();
  const media = mockDeep<MediaService>();
  media.hydrate.mockResolvedValue({ [M]: { id: M, url: 'https://x/m.png', kind: 'IMAGE' } });
  media.assertOwnedReady.mockResolvedValue(undefined);
  const repo = new QuestionRepository(prisma);
  const service = new QuestionWriterService(repo, new QuestionReaderService(repo, media), audit, media);
  return { prisma, audit, media, service };
}

describe('QuestionWriterService', () => {
  it('create: kiểm media, đặt gradingMode theo type, ghi audit', async () => {
    const { prisma, audit, media, service } = setup();
    prisma.question.create.mockResolvedValue(row as never);
    const view = await service.create(teacher, {
      type: 'MULTIPLE_CHOICE',
      instruction: row.instruction,
      points: 1,
      tags: ['Nn', 'nn'],
      config: row.config as never,
      answerKey: row.answerKey as never,
      visibility: 'SHARED',
    });
    expect(media.assertOwnedReady).toHaveBeenCalledWith([M], teacher);
    expect(prisma.question.create.mock.calls[0][0].data).toMatchObject({ gradingMode: 'AUTO', tags: ['nn'] });
    expect(audit.record).toHaveBeenCalledWith(
      teacher,
      'question.create',
      'Question',
      row.id,
      null,
      expect.anything(),
    );
    expect(view.thumbnail?.url).toBe('https://x/m.png');
    expect(view.media[M]).toBeDefined();
  });

  it('update: người khác → FORBIDDEN_SCOPE; đổi type → VALIDATION_ERROR', async () => {
    const { prisma, service } = setup();
    prisma.question.findUnique.mockResolvedValue(row as never);
    await expect(service.update(other, row.id, { instruction: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    await expect(
      service.update(teacher, row.id, {
        config: { type: 'SPEAK', prompt: 'Say: jam' },
        answerKey: { type: 'SPEAK' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('update: config + answerKey không khớp nhau theo luật → VALIDATION_ERROR với details', async () => {
    const { prisma, service } = setup();
    prisma.question.findUnique.mockResolvedValue(row as never);
    await expect(
      service.update(teacher, row.id, {
        config: row.config as never,
        answerKey: { type: 'MULTIPLE_CHOICE', optionId: 'zzz' },
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { 'answerKey.optionId': expect.any(Array) },
    });
  });

  it('archive: câu đang dùng trong phiếu → WORKSHEET_IN_USE', async () => {
    const { prisma, service } = setup();
    prisma.question.findUnique.mockResolvedValue({ ...row, _count: { items: 2 } } as never);
    await expect(service.archive(teacher, row.id)).rejects.toMatchObject({ code: 'WORKSHEET_IN_USE' });
  });

  it('duplicate: bản sao DRAFT thuộc người gọi', async () => {
    const { prisma, service } = setup();
    prisma.question.findFirst.mockResolvedValue({ ...row, status: 'PUBLISHED' } as never);
    prisma.question.create.mockResolvedValue({ ...row, id: A, createdById: other.id } as never);
    await service.duplicate(other, row.id);
    expect(prisma.question.create.mock.calls[0][0].data).toMatchObject({
      status: 'DRAFT',
      createdById: other.id,
    });
  });
});
