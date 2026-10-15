import { Injectable } from '@nestjs/common';
import {
  MANUAL_TYPES,
  REPORT_MIME,
  type ReportFormat,
  type ReportQuery,
  type WorksheetSnapshot,
} from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { TimeService } from '@/core/time/time.service';
import { PrismaService } from '@/database/prisma.service';
import { AssignmentReaderService } from '@/modules/assignments/services/assignment-reader.service';
import { isoDateOf } from '@/modules/assignments/utils/assignment-dates';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { RankingService } from '@/modules/points/services/ranking.service';
import { itemsOf } from '@/modules/worksheets/utils/worksheet-snapshot';
import { type ReportFile, reportEntryInclude } from '@/modules/reports/types/report.types';
import { rangeLabel, rangeSlug, slugify } from '@/modules/reports/utils/report-format';
import {
  type AssignmentResultColumn,
  type AssignmentResultRow,
  buildAssignmentResultsWorkbook,
} from '@/modules/reports/writers/assignment-results.writer';
import { buildRankingPdf } from '@/modules/reports/writers/pdf.writer';
import {
  type PointsRow,
  type ReportMeta,
  buildPointsWorkbook,
  buildRankingWorkbook,
} from '@/modules/reports/writers/xlsx.writer';

/** Giới hạn số dòng sổ điểm xuất ra một file */
export const POINTS_EXPORT_MAX_ROWS = 10_000;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
    private readonly access: AccessService,
    private readonly ranking: RankingService,
    private readonly assignments: AssignmentReaderService,
  ) {}

  /** Kết quả một bài giao: mỗi học sinh một dòng + điểm từng câu (xlsx) */
  async assignmentResults(user: AuthUser, assignmentId: string): Promise<ReportFile> {
    const assignment = await this.assignments.load(user, assignmentId);
    const snapshot = assignment.snapshot as unknown as WorksheetSnapshot;
    const roster = await this.assignments.roster(user, assignmentId);
    const columns: AssignmentResultColumn[] = snapshot.sections.flatMap((s, si) =>
      s.items.map((it, ii) => ({
        worksheetItemId: it.worksheetItemId,
        label: `P${si + 1}-Q${ii + 1} ${it.question.type}${MANUAL_TYPES.includes(it.question.type) ? '*' : ''}`,
        points: it.points,
      })),
    );
    const itemIds = itemsOf(snapshot).map((it) => it.worksheetItemId);
    const submissionIds = roster.items
      .map((r) => r.bestSubmissionId ?? r.latestSubmissionId)
      .filter((id): id is string => !!id);
    const submissions = await this.prisma.submission.findMany({
      where: { id: { in: submissionIds } },
      include: { answers: { select: { worksheetItemId: true, autoScore: true, manualScore: true } } },
    });
    const byId = new Map(submissions.map((s) => [s.id, s]));
    const rows: AssignmentResultRow[] = roster.items.map((r) => {
      const s = byId.get(r.bestSubmissionId ?? r.latestSubmissionId ?? '');
      const scores = new Map(
        s?.answers.map((a) => [a.worksheetItemId, a.manualScore ?? a.autoScore ?? null]) ?? [],
      );
      return {
        rank: r.rank,
        displayName: r.displayName,
        status: r.status,
        attemptNo: s?.attemptNo ?? null,
        submittedAt: s?.submittedAt ? this.formatDateTime(s.submittedAt) : null,
        late: r.late,
        autoScore: s?.autoScore ?? null,
        manualScore: s?.manualScore ?? null,
        totalScore: s?.totalScore ?? null,
        maxScore: assignment.maxScore,
        percent: r.percent,
        itemScores: itemIds.map((id) => scores.get(id) ?? null),
      };
    });
    const buffer = await buildAssignmentResultsWorkbook(
      {
        worksheetTitle: snapshot.title,
        className: assignment.class.name,
        scheduledFor: isoDateOf(assignment.scheduledFor),
        generatedAt: this.formatDateTime(new Date()),
      },
      columns,
      rows,
    );
    return {
      buffer,
      filename: `worksheet-${slugify(snapshot.title)}-${slugify(assignment.class.name)}-${isoDateOf(assignment.scheduledFor)}.xlsx`,
      mime: REPORT_MIME.xlsx,
    };
  }

  /** Bảng xếp hạng lớp (xlsx / pdf) — dữ liệu cùng nguồn với GET /classes/:id/ranking */
  async classRanking(
    user: AuthUser,
    classId: string,
    query: ReportQuery,
    format: ReportFormat,
  ): Promise<ReportFile> {
    const cls = await this.loadClass(user, classId);
    const entries = await this.ranking.rankingEntries(classId, {
      range: this.time.resolveRange(query),
      gameId: query.gameId ?? null,
    });
    const meta = this.meta(cls.name, query);
    const rows = entries.map(({ rank, displayName, points }) => ({ rank, displayName, points }));
    const buffer =
      format === 'pdf' ? await buildRankingPdf(meta, rows) : await buildRankingWorkbook(meta, rows);
    return {
      buffer,
      filename: `ranking-${slugify(cls.name)}-${rangeSlug(query)}.${format}`,
      mime: REPORT_MIME[format],
    };
  }

  /** Sổ điểm của lớp (bút toán ghi nhận khi học sinh đang ở lớp này), tối đa POINTS_EXPORT_MAX_ROWS dòng */
  async classPoints(user: AuthUser, classId: string, query: ReportQuery): Promise<ReportFile> {
    const cls = await this.loadClass(user, classId);
    const range = this.time.resolveRange(query);
    const entries = await this.prisma.pointEntry.findMany({
      where: {
        classId,
        gameId: query.gameId,
        createdAt: range ? { gte: range.from, lt: range.to } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: POINTS_EXPORT_MAX_ROWS,
      include: reportEntryInclude,
    });
    const rows: PointsRow[] = entries.map((e) => ({
      date: this.formatDateTime(e.createdAt),
      studentName: e.student.user.displayName,
      kind: e.kind,
      gameId: e.gameId,
      points: e.points,
      note: e.note,
      createdByName: e.createdBy?.displayName ?? null,
    }));
    return {
      buffer: await buildPointsWorkbook(this.meta(cls.name, query), rows),
      filename: `points-${slugify(cls.name)}-${rangeSlug(query)}.xlsx`,
      mime: REPORT_MIME.xlsx,
    };
  }

  private async loadClass(user: AuthUser, classId: string): Promise<{ name: string }> {
    await this.access.assertClassAccess(user, classId);
    const cls = await this.prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
    if (!cls) throw notFound('classNotFound');
    return cls;
  }

  private meta(className: string, query: ReportQuery): ReportMeta {
    return {
      className,
      rangeLabel: rangeLabel(query),
      gameId: query.gameId ?? null,
      generatedAt: this.formatDateTime(new Date()),
    };
  }

  /** `dd/MM/yyyy HH:mm` theo APP_TIMEZONE */
  private formatDateTime(date: Date): string {
    return this.time.format(date, 'DD/MM/YYYY HH:mm');
  }
}
