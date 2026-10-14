import { Injectable } from '@nestjs/common';
import {
  type AssignmentCounts,
  type AssignmentDetail,
  type AssignmentListQuery,
  type AssignmentRankingResponse,
  type AssignmentRosterResponse,
  type AssignmentSummary,
  type AssignmentsDashboard,
  type Paginated,
  type WorksheetSnapshot,
  collectMediaIds,
} from '@phonics/contracts';
import { groupBy } from 'es-toolkit';
import { notFound } from '@/common/errors/app-error';
import { orderBy, paginate } from '@/common/utils/paginate';
import { AccessService } from '@/core/access/access.service';
import { TimeService } from '@/core/time/time.service';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { MediaService } from '@/modules/media/services/media.service';
import { toAssignmentSummary, toRosterRow } from '@/modules/assignments/dto/responses/assignment.view';
import { AssignmentRepository } from '@/modules/assignments/repositories/assignment.repository';
import { ASSIGNMENT_SORT_FIELDS, type AssignmentRow } from '@/modules/assignments/types/assignment.types';
import { dateOnly } from '@/modules/assignments/utils/assignment-dates';
import { AssignmentRankingService } from '@/modules/assignments/services/assignment-ranking.service';

/** Đọc bài giao phía giáo viên / admin (luôn kiểm tra phạm vi lớp qua AccessService) */
@Injectable()
export class AssignmentReaderService {
  constructor(
    private readonly repo: AssignmentRepository,
    private readonly access: AccessService,
    private readonly time: TimeService,
    private readonly media: MediaService,
    private readonly rankingService: AssignmentRankingService,
  ) {}

  /** Load + kiểm tra phạm vi lớp (GV) */
  async load(user: AuthUser, id: string): Promise<AssignmentRow> {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('Không tìm thấy bài giao');
    await this.access.assertClassAccess(user, row.classId);
    return row;
  }

  async get(user: AuthUser, id: string): Promise<AssignmentDetail> {
    return this.detail(await this.load(user, id));
  }

  /** Bài giao + snapshot (có answerKey) + media + thống kê nhanh */
  async detail(row: AssignmentRow): Promise<AssignmentDetail> {
    const snapshot = row.snapshot as unknown as WorksheetSnapshot;
    const [counts, media] = await Promise.all([
      this.repo.countsFor([row.id]),
      this.media.hydrate(collectMediaIds(snapshot)),
    ]);
    return { ...toAssignmentSummary(row, counts.get(row.id)), snapshot, media };
  }

  countsFor(ids: readonly string[]): Promise<Map<string, AssignmentCounts>> {
    return this.repo.countsFor(ids);
  }

  async list(user: AuthUser, query: AssignmentListQuery): Promise<Paginated<AssignmentSummary>> {
    const classIds = await this.access.scopedClassIds(user, query.classId);
    const where: Prisma.AssignmentWhereInput = {
      classId: classIds ? { in: classIds } : undefined,
      status: query.status,
      worksheetId: query.worksheetId,
      scheduledFor:
        query.from || query.to
          ? {
              gte: query.from ? dateOnly(query.from) : undefined,
              lte: query.to ? dateOnly(query.to) : undefined,
            }
          : undefined,
      worksheet: query.q ? { title: { contains: query.q, mode: 'insensitive' } } : undefined,
    };
    const sort = orderBy(query.sort, ASSIGNMENT_SORT_FIELDS, { scheduledFor: 'desc' });
    return paginate(
      query,
      async (page) => {
        const rows = await this.repo.findPage(where, page, [sort, { createdAt: 'desc' }]);
        const counts = await this.repo.countsFor(rows.map((r) => r.id));
        return rows.map((r) => toAssignmentSummary(r, counts.get(r.id)));
      },
      () => this.repo.count(where),
    );
  }

  /** Mỗi học sinh đang ở lớp một dòng (kể cả chưa làm) */
  async roster(user: AuthUser, id: string): Promise<AssignmentRosterResponse> {
    const assignment = await this.load(user, id);
    const [members, submissions, ranks] = await Promise.all([
      this.repo.rosterMembers(assignment.classId),
      this.repo.rosterSubmissions(id),
      this.rankingService.rank(id),
    ]);
    const rankBy = new Map(ranks.map((r) => [r.studentId, r.rank]));
    const byStudent = groupBy(submissions, (s) => s.studentId);
    return {
      items: members.map((m) =>
        toRosterRow(m, byStudent[m.studentId] ?? [], rankBy.get(m.studentId) ?? null),
      ),
    };
  }

  /** Xếp hạng theo bài (GV) */
  async ranking(user: AuthUser, id: string): Promise<AssignmentRankingResponse> {
    return this.rankingOf(await this.load(user, id));
  }

  /** Dựng bảng xếp hạng cho một bài đã kiểm tra quyền (dùng chung GV / học sinh) */
  async rankingOf(row: AssignmentRow, meId?: string): Promise<AssignmentRankingResponse> {
    const items = await this.rankingService.entries(row.id, meId);
    return {
      assignmentId: row.id,
      worksheetTitle: row.worksheet.title,
      classId: row.classId,
      className: row.class.name,
      items,
      me: items.find((e) => e.isMe) ?? null,
    };
  }

  /** Dashboard GV: bài đến hạn / diễn ra hôm nay, số bài mở, số bài chờ chấm */
  async dashboard(user: AuthUser): Promise<AssignmentsDashboard> {
    const classIds = await this.access.scopedClassIds(user);
    const scope: Prisma.AssignmentWhereInput = { classId: classIds ? { in: classIds } : undefined };
    const today = this.time.dayRange();
    const [dueRows, openCount, pendingGrading] = await Promise.all([
      this.repo.findDueOrScheduledOn(scope, today, this.time.toIsoDate(today.from)),
      this.repo.count({ AND: [scope, { status: 'OPEN' }] }),
      this.repo.countPendingGrading(scope),
    ]);
    const counts = await this.repo.countsFor(dueRows.map((r) => r.id));
    return {
      dueToday: dueRows.map((r) => toAssignmentSummary(r, counts.get(r.id))),
      openCount,
      pendingGrading,
      generatedAt: new Date().toISOString(),
    };
  }
}
