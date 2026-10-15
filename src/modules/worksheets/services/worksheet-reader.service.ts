import { Injectable } from '@nestjs/common';
import {
  type Paginated,
  type WorksheetDetail,
  type WorksheetListQuery,
  type WorksheetSummary,
} from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { orderBy, paginate } from '@/common/utils/paginate';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { MediaService } from '@/modules/media/services/media.service';
import { questionMediaIds } from '@/modules/questions/utils/question-content';
import { toWorksheetDetail, toWorksheetSummary } from '@/modules/worksheets/dto/responses/worksheet.view';
import { WorksheetRepository } from '@/modules/worksheets/repositories/worksheet.repository';
import { WORKSHEET_SORT_FIELDS, type WorksheetDetailRow } from '@/modules/worksheets/types/worksheet.types';
import { worksheetVisibleWhere } from '@/modules/worksheets/utils/worksheet-rules';
import { type SnapshotSource } from '@/modules/worksheets/utils/worksheet-snapshot';

/** Đọc phiếu bài tập (ADR 0017): GV thấy phiếu của mình ∪ SHARED PUBLISHED */
@Injectable()
export class WorksheetReaderService {
  constructor(
    private readonly repo: WorksheetRepository,
    private readonly media: MediaService,
  ) {}

  async list(user: AuthUser, query: WorksheetListQuery): Promise<Paginated<WorksheetSummary>> {
    const where: Prisma.WorksheetWhereInput = {
      AND: [
        worksheetVisibleWhere(user),
        {
          status: query.status,
          visibility: query.visibility,
          subject: query.subject,
          kind: query.kind,
          grade: query.grade,
          week: query.week,
          createdById: query.mine ? user.id : query.createdById,
          OR: query.q
            ? [
                { title: { contains: query.q, mode: 'insensitive' } },
                { topic: { contains: query.q, mode: 'insensitive' } },
              ]
            : undefined,
        },
      ],
    };
    const sort = orderBy(query.sort, WORKSHEET_SORT_FIELDS, { updatedAt: 'desc' });
    return paginate(
      query,
      async (page) => (await this.repo.findPage(where, page, [sort, { id: 'asc' }])).map(toWorksheetSummary),
      () => this.repo.count(where),
    );
  }

  async get(user: AuthUser, id: string): Promise<WorksheetDetail> {
    const row = await this.repo.findVisible(user, id);
    if (!row) throw notFound('worksheetNotFound');
    return this.detail(row);
  }

  /** WorksheetDetail kèm map media của mọi câu */
  async detail(row: WorksheetDetailRow): Promise<WorksheetDetail> {
    const ids = row.sections.flatMap((s) =>
      s.items.flatMap((it) => questionMediaIds(it.question.config, it.question.example)),
    );
    return toWorksheetDetail(row, await this.media.hydrate(ids));
  }

  /** Dữ liệu để đóng băng khi giao bài (assignments) — phải visible với người giao */
  async loadForSnapshot(user: AuthUser, id: string, tx?: Tx): Promise<SnapshotSource & { status: string }> {
    const row = await this.repo.findSnapshotSource(user, id, tx);
    if (!row) throw notFound('worksheetNotFound');
    return row;
  }
}
