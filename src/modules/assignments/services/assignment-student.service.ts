import { Injectable } from '@nestjs/common';
import {
  type AssignmentRankingResponse,
  type MyAssignmentDetail,
  type MyAssignmentListQuery,
  type MyAssignmentSummary,
  type Paginated,
  type WorksheetSnapshot,
  collectMediaIds,
} from '@phonics/contracts';
import { AppError, notFound } from '../../../common/errors/app-error';
import { paginate } from '../../../common/utils/paginate';
import { type Prisma } from '../../../generated/prisma/client';
import { type AuthUser } from '../../auth/types/auth.types';
import { MediaService } from '../../media/services/media.service';
import { toSubmissionSummary } from '../../submissions/dto/responses/submission.view';
import { stripAnswerKeys } from '../../worksheets/utils/worksheet-snapshot';
import { type MySubmissionBrief, toMyAssignmentSummary } from '../dto/responses/assignment.view';
import { AssignmentRepository } from '../repositories/assignment.repository';
import { type AssignmentRow } from '../types/assignment.types';
import { AssignmentRankingService } from './assignment-ranking.service';
import { AssignmentReaderService } from './assignment-reader.service';

/** Bài giao nhìn từ học sinh (/me/assignments): chỉ bài của lớp đang học, SCHEDULED coi như chưa tồn tại */
@Injectable()
export class AssignmentStudentService {
  constructor(
    private readonly repo: AssignmentRepository,
    private readonly reader: AssignmentReaderService,
    private readonly media: MediaService,
    private readonly rankingService: AssignmentRankingService,
  ) {}

  /** Lớp đang học của học sinh (404 nếu chưa có lớp) */
  async myClassId(user: AuthUser): Promise<string> {
    const classId = await this.repo.currentClassId(user.id);
    if (!classId) throw new AppError('NOT_FOUND', 404, { message: 'Bạn chưa thuộc lớp nào' });
    return classId;
  }

  /** Bài giao của lớp học sinh đang học; SCHEDULED coi như chưa tồn tại */
  async loadForStudent(user: AuthUser, id: string): Promise<AssignmentRow> {
    const row = await this.repo.findInClass(id, await this.myClassId(user));
    if (!row || row.status === 'SCHEDULED') throw notFound('Không tìm thấy bài tập');
    return row;
  }

  async list(user: AuthUser, query: MyAssignmentListQuery): Promise<Paginated<MyAssignmentSummary>> {
    const classId = await this.myClassId(user);
    const byFilter: Record<MyAssignmentListQuery['filter'], Prisma.AssignmentWhereInput> = {
      open: { status: 'OPEN' },
      upcoming: { status: 'SCHEDULED' },
      done: { submissions: { some: { studentId: user.id, status: { in: ['SUBMITTED', 'GRADED'] } } } },
      all: {},
    };
    const where: Prisma.AssignmentWhereInput = { AND: [{ classId }, byFilter[query.filter]] };
    return paginate(
      query,
      async (page) =>
        this.summaries(
          user,
          await this.repo.findPage(where, page, [{ scheduledFor: 'desc' }, { createdAt: 'desc' }]),
        ),
      () => this.repo.count(where),
    );
  }

  async detail(user: AuthUser, id: string): Promise<MyAssignmentDetail> {
    const row = await this.loadForStudent(user, id);
    const [summary] = await this.summaries(user, [row]);
    const worksheet = stripAnswerKeys(row.snapshot as unknown as WorksheetSnapshot);
    const [media, submissions] = await Promise.all([
      this.media.hydrate(collectMediaIds(worksheet)),
      this.repo.studentSubmissions(id, user.id),
    ]);
    return { ...summary, worksheet, media, submissions: submissions.map(toSubmissionSummary) };
  }

  /** Xếp hạng theo bài, đánh dấu dòng của chính học sinh */
  async ranking(user: AuthUser, id: string): Promise<AssignmentRankingResponse> {
    return this.reader.rankingOf(await this.loadForStudent(user, id), user.id);
  }

  private async summaries(user: AuthUser, rows: AssignmentRow[]): Promise<MyAssignmentSummary[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const now = new Date();
    const [submissions, ranks] = await Promise.all([
      this.repo.studentSubmissionBriefs(ids, user.id),
      Promise.all(ids.map((id) => this.rankingService.rankOf(id, user.id))),
    ]);
    const rankBy = new Map(ids.map((id, i) => [id, ranks[i]?.rank ?? null]));
    const grouped = new Map<string, MySubmissionBrief[]>();
    for (const s of submissions) grouped.set(s.assignmentId, [...(grouped.get(s.assignmentId) ?? []), s]);
    return rows.map((row) =>
      toMyAssignmentSummary(row, grouped.get(row.id) ?? [], rankBy.get(row.id) ?? null, now),
    );
  }
}
