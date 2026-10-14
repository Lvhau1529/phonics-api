import { Injectable } from '@nestjs/common';
import {
  type CreateWorksheetBody,
  type UpdateWorksheetBody,
  type WorksheetDetail,
  type WorksheetStructureBody,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { QuestionReaderService } from '@/modules/questions/services/question-reader.service';
import { WorksheetRepository } from '@/modules/worksheets/repositories/worksheet.repository';
import { type WorksheetDetailRow } from '@/modules/worksheets/types/worksheet.types';
import {
  assertPublishable,
  assertStructureBelongs,
  countItems,
} from '@/modules/worksheets/utils/worksheet-rules';
import { WorksheetReaderService } from '@/modules/worksheets/services/worksheet-reader.service';

/**
 * Tạo / sửa / sắp cấu trúc / phát hành / lưu trữ / nhân bản phiếu. Chỉ chủ sở hữu / ADMIN sửa. Giao cho lớp
 * → snapshot (assignments), nên archive phiếu không ảnh hưởng bài đã giao.
 */
@Injectable()
export class WorksheetWriterService {
  constructor(
    private readonly repo: WorksheetRepository,
    private readonly reader: WorksheetReaderService,
    private readonly audit: AuditService,
    private readonly questions: QuestionReaderService,
  ) {}

  async create(actor: AuthUser, body: CreateWorksheetBody): Promise<WorksheetDetail> {
    const row = await this.repo.create({
      title: body.title,
      subject: body.subject,
      topic: body.topic,
      grade: body.grade,
      week: body.week,
      day: body.day,
      kind: body.kind,
      visibility: body.visibility,
      note: body.note,
      createdById: actor.id,
      // Phiếu mới luôn có sẵn Part 1 để thêm câu ngay
      sections: { create: { order: 0, title: 'Part 1' } },
    });
    await this.audit.record(actor, 'worksheet.create', 'Worksheet', row.id, null, {
      title: row.title,
      kind: row.kind,
    });
    return this.reader.detail(row);
  }

  async update(actor: AuthUser, id: string, body: UpdateWorksheetBody): Promise<WorksheetDetail> {
    const current = await this.loadEditable(actor, id);
    const row = await this.repo.update(id, body);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(body) as (keyof UpdateWorksheetBody)[]) {
      if (current[key] !== row[key]) {
        before[key] = current[key];
        after[key] = row[key];
      }
    }
    if (Object.keys(after).length)
      await this.audit.record(actor, 'worksheet.update', 'Worksheet', id, before, after);
    return this.reader.detail(row);
  }

  /** Thay toàn bộ cấu trúc (Part + câu); id section / item cũ được giữ để snapshot sau này ổn định */
  async replaceStructure(
    actor: AuthUser,
    id: string,
    body: WorksheetStructureBody,
  ): Promise<WorksheetDetail> {
    const current = await this.loadEditable(actor, id);
    const missing = await this.questions.missingUsable(
      actor,
      body.sections.flatMap((s) => s.items.map((it) => it.questionId)),
    );
    if (missing.length) {
      throw new AppError('VALIDATION_ERROR', 400, {
        message: 'Có câu hỏi không tồn tại, đã lưu trữ hoặc bạn không được dùng',
        details: { questionIds: missing },
      });
    }
    assertStructureBelongs(current, body);
    const row = await this.repo.transaction((tx) => this.repo.replaceStructure(tx, id, body));
    await this.audit.record(
      actor,
      'worksheet.structure',
      'Worksheet',
      id,
      { sections: current.sections.length, items: countItems(current) },
      { sections: row.sections.length, items: countItems(row) },
    );
    return this.reader.detail(row);
  }

  /** Phát hành: cần ≥ 1 câu và mọi câu đã PUBLISHED */
  async publish(actor: AuthUser, id: string): Promise<WorksheetDetail> {
    const current = await this.loadEditable(actor, id);
    if (current.status === 'PUBLISHED') return this.reader.detail(current);
    assertPublishable(current);
    const row = await this.repo.update(id, { status: 'PUBLISHED' });
    await this.audit.record(
      actor,
      'worksheet.publish',
      'Worksheet',
      id,
      { status: current.status },
      { status: 'PUBLISHED' },
    );
    return this.reader.detail(row);
  }

  async archive(actor: AuthUser, id: string): Promise<WorksheetDetail> {
    const current = await this.loadEditable(actor, id);
    if (current.status === 'ARCHIVED') return this.reader.detail(current);
    const row = await this.repo.update(id, { status: 'ARCHIVED' });
    await this.audit.record(
      actor,
      'worksheet.archive',
      'Worksheet',
      id,
      { status: current.status },
      { status: 'ARCHIVED' },
    );
    return this.reader.detail(row);
  }

  /** Bản sao DRAFT (metadata + Part + câu; không sao chép bài giao) */
  async duplicate(actor: AuthUser, id: string): Promise<WorksheetDetail> {
    const source = await this.repo.findVisible(actor, id);
    if (!source) throw notFound('Không tìm thấy phiếu bài tập');
    const title = `${source.title} (copy)`.slice(0, 120);
    const newId = await this.repo.transaction((tx) => this.repo.duplicate(tx, source, actor.id, title));
    await this.audit.record(actor, 'worksheet.create', 'Worksheet', newId, null, {
      duplicatedFrom: id,
      title,
    });
    return this.reader.get(actor, newId);
  }

  private async loadEditable(user: AuthUser, id: string): Promise<WorksheetDetailRow> {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('Không tìm thấy phiếu bài tập');
    if (row.createdById !== user.id && user.role !== 'ADMIN') throw new AppError('FORBIDDEN_SCOPE', 403);
    return row;
  }
}
