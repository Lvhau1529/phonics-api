import { Injectable } from '@nestjs/common';
import {
  type Paginated,
  type QuestionListQuery,
  type QuestionSummary,
  type QuestionView,
  type TagsResponse,
  collectMediaIds,
} from '@phonics/contracts';
import { countBy, orderBy as sortByKeys } from 'es-toolkit';
import { notFound } from '@/common/errors/app-error';
import { orderBy, paginate } from '@/common/utils/paginate';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { MediaService } from '@/modules/media/services/media.service';
import { toQuestionSummary, toQuestionView } from '@/modules/questions/dto/responses/question.view';
import { QuestionRepository } from '@/modules/questions/repositories/question.repository';
import { QUESTION_SORT_FIELDS, type QuestionRow } from '@/modules/questions/types/question.types';
import { questionMediaIds, questionVisibleWhere } from '@/modules/questions/utils/question-content';

/** Đọc ngân hàng câu hỏi (ADR 0017): GV thấy câu của mình ∪ câu SHARED đã PUBLISHED */
@Injectable()
export class QuestionReaderService {
  constructor(
    private readonly repo: QuestionRepository,
    private readonly media: MediaService,
  ) {}

  async list(user: AuthUser, query: QuestionListQuery): Promise<Paginated<QuestionSummary>> {
    const where: Prisma.QuestionWhereInput = {
      AND: [
        questionVisibleWhere(user),
        {
          type: query.type,
          status: query.status,
          visibility: query.visibility,
          createdById: query.mine ? user.id : query.createdById,
          tags: query.tag ? { has: query.tag } : undefined,
          OR: query.q
            ? [
                { instruction: { contains: query.q, mode: 'insensitive' } },
                { tags: { has: query.q.toLowerCase() } },
              ]
            : undefined,
        },
      ],
    };
    const sort = orderBy(query.sort, QUESTION_SORT_FIELDS, { updatedAt: 'desc' });
    return paginate(
      query,
      async (page) => {
        const rows = await this.repo.findPage(where, page, [sort, { id: 'asc' }]);
        const media = await this.media.hydrate(rows.flatMap((r) => collectMediaIds(r.config)));
        return rows.map((r) => toQuestionSummary(r, media));
      },
      () => this.repo.count(where),
    );
  }

  /** Tag đã dùng (trong câu visible) + số câu, để gợi ý ở editor */
  async tags(user: AuthUser): Promise<TagsResponse> {
    const counts = countBy((await this.repo.visibleTags(user)).flat(), (tag) => tag);
    const items = sortByKeys(
      Object.entries(counts).map(([tag, count]) => ({ tag, count })),
      ['count'],
      ['desc'],
    );
    return { items };
  }

  async get(user: AuthUser, id: string): Promise<QuestionView> {
    return this.view(await this.loadVisible(user, id));
  }

  async loadVisible(user: AuthUser, id: string): Promise<QuestionRow> {
    const row = await this.repo.findVisible(user, id);
    if (!row) throw notFound('Không tìm thấy câu hỏi');
    return row;
  }

  /** Câu hỏi (visible) dùng được trong phiếu của `user`: ids không hợp lệ / ARCHIVED → trả về danh sách thiếu */
  async missingUsable(user: AuthUser, ids: readonly string[], tx?: Tx): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const ok = await this.repo.usableIds(user, unique, tx);
    return unique.filter((id) => !ok.has(id));
  }

  /** QuestionView kèm map media */
  async view(row: QuestionRow): Promise<QuestionView> {
    const media = await this.media.hydrate(questionMediaIds(row.config, row.example));
    return toQuestionView(row, media);
  }
}
