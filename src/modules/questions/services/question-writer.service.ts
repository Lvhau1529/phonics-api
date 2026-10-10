import { Injectable } from '@nestjs/common';
import {
  type CreateQuestionBody,
  QuestionContent,
  type QuestionView,
  type UpdateQuestionBody,
  gradingModeOf,
} from '@phonics/contracts';
import { AppError, notFound } from '../../../common/errors/app-error';
import { flattenZodError } from '../../../common/filters/all-exceptions.filter';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { MediaService } from '../../media/services/media.service';
import { QuestionRepository } from '../repositories/question.repository';
import { type QuestionRow } from '../types/question.types';
import { normalizeTags, questionMediaIds } from '../utils/question-content';
import { QuestionReaderService } from './question-reader.service';

/**
 * Tạo / sửa / phát hành / lưu trữ / nhân bản câu hỏi. Chỉ chủ sở hữu / ADMIN sửa. Không xoá cứng
 * (worksheet_items tham chiếu) — chỉ ARCHIVED, và chỉ khi không còn phiếu nào (chưa archive) dùng.
 */
@Injectable()
export class QuestionWriterService {
  constructor(
    private readonly repo: QuestionRepository,
    private readonly reader: QuestionReaderService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async create(actor: AuthUser, body: CreateQuestionBody): Promise<QuestionView> {
    await this.media.assertOwnedReady(questionMediaIds(body.config, body.example), actor);
    const row = await this.repo.create({
      type: body.type,
      gradingMode: gradingModeOf(body.type),
      instruction: body.instruction,
      instructionVi: body.instructionVi,
      points: body.points,
      tags: normalizeTags(body.tags),
      example: body.example as Prisma.InputJsonValue | undefined,
      config: body.config as Prisma.InputJsonValue,
      answerKey: body.answerKey as Prisma.InputJsonValue,
      visibility: body.visibility,
      createdById: actor.id,
    });
    await this.audit.record(actor, 'question.create', 'Question', row.id, null, {
      type: row.type,
      instruction: row.instruction,
      visibility: row.visibility,
    });
    return this.reader.view(row);
  }

  async update(actor: AuthUser, id: string, body: UpdateQuestionBody): Promise<QuestionView> {
    const current = await this.loadEditable(actor, id);
    if (body.config && body.answerKey) {
      if (body.config.type !== current.type || body.answerKey.type !== current.type)
        throw new AppError('VALIDATION_ERROR', 400, {
          details: { 'config.type': ['Không đổi được dạng câu hỏi'] },
        });
      const check = QuestionContent.safeParse({
        type: current.type,
        config: body.config,
        answerKey: body.answerKey,
      });
      if (!check.success)
        throw new AppError('VALIDATION_ERROR', 400, { details: flattenZodError(check.error) });
    }
    const example = body.example === undefined ? current.example : body.example;
    const config = body.config ?? current.config;
    await this.media.assertOwnedReady(questionMediaIds(config, example), actor);

    const row = await this.repo.update(id, {
      instruction: body.instruction,
      instructionVi: body.instructionVi,
      points: body.points,
      tags: body.tags ? normalizeTags(body.tags) : undefined,
      example:
        body.example === undefined
          ? undefined
          : body.example === null
            ? Prisma.DbNull
            : (body.example as Prisma.InputJsonValue),
      config: body.config as Prisma.InputJsonValue | undefined,
      answerKey: body.answerKey as Prisma.InputJsonValue | undefined,
      visibility: body.visibility,
    });
    await this.audit.record(
      actor,
      'question.update',
      'Question',
      id,
      { instruction: current.instruction, points: current.points, visibility: current.visibility },
      {
        instruction: row.instruction,
        points: row.points,
        visibility: row.visibility,
        contentChanged: !!body.config,
      },
    );
    return this.reader.view(row);
  }

  async publish(actor: AuthUser, id: string): Promise<QuestionView> {
    const current = await this.loadEditable(actor, id);
    if (current.status === 'PUBLISHED') return this.reader.view(current);
    const row = await this.repo.update(id, { status: 'PUBLISHED' });
    await this.audit.record(
      actor,
      'question.publish',
      'Question',
      id,
      { status: current.status },
      { status: 'PUBLISHED' },
    );
    return this.reader.view(row);
  }

  /** Lưu trữ: không còn phiếu (chưa archive) nào dùng; phiếu đã giao vẫn chạy nhờ snapshot */
  async archive(actor: AuthUser, id: string): Promise<QuestionView> {
    const current = await this.loadEditable(actor, id);
    if (current.status === 'ARCHIVED') return this.reader.view(current);
    if (current._count.items > 0) {
      throw new AppError('WORKSHEET_IN_USE', 409, {
        details: { worksheets: [String(current._count.items)] },
      });
    }
    const row = await this.repo.update(id, { status: 'ARCHIVED' });
    await this.audit.record(
      actor,
      'question.archive',
      'Question',
      id,
      { status: current.status },
      { status: 'ARCHIVED' },
    );
    return this.reader.view(row);
  }

  /** Bản sao DRAFT thuộc về người gọi (dùng được với câu SHARED của người khác) */
  async duplicate(actor: AuthUser, id: string): Promise<QuestionView> {
    const source = await this.reader.loadVisible(actor, id);
    const row = await this.repo.create({
      type: source.type,
      gradingMode: source.gradingMode,
      instruction: source.instruction,
      instructionVi: source.instructionVi,
      points: source.points,
      tags: source.tags,
      example: source.example as Prisma.InputJsonValue | undefined,
      config: source.config as Prisma.InputJsonValue,
      answerKey: source.answerKey as Prisma.InputJsonValue,
      visibility: source.visibility,
      status: 'DRAFT',
      createdById: actor.id,
    });
    await this.audit.record(actor, 'question.create', 'Question', row.id, null, {
      duplicatedFrom: id,
      type: row.type,
    });
    return this.reader.view(row);
  }

  private async loadEditable(user: AuthUser, id: string): Promise<QuestionRow> {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('Không tìm thấy câu hỏi');
    if (row.createdById !== user.id && user.role !== 'ADMIN') throw new AppError('FORBIDDEN_SCOPE', 403);
    return row;
  }
}
