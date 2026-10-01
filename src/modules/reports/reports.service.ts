import { Injectable } from '@nestjs/common';
import { REPORT_MIME, type RangePreset, type ReportFormat, type ReportQuery } from '@phonics/contracts';
import { notFound } from '../../common/errors/app-error';
import { AccessService } from '../../core/access/access.service';
import { PrismaService } from '../../core/database/prisma.service';
import { TimeService } from '../../core/time/time.service';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../auth/auth.types';
import { RankingService } from '../points/ranking.service';
import { buildRankingPdf } from './writers/pdf.writer';
import {
  buildPointsWorkbook,
  buildRankingWorkbook,
  type PointsRow,
  type ReportMeta,
} from './writers/xlsx.writer';

/** Giới hạn số dòng sổ điểm xuất ra một file */
export const POINTS_EXPORT_MAX_ROWS = 10_000;

/** File đã sinh xong, controller chỉ việc trả về */
export interface ReportFile {
  buffer: Buffer;
  filename: string;
  mime: string;
}

const RANGE_LABEL: Record<RangePreset, string> = {
  all: 'Tất cả',
  today: 'Hôm nay',
  week: 'Tuần này',
  month: 'Tháng này',
};

/** Nhãn khoảng thời gian in trong báo cáo */
export function rangeLabel(query: Pick<ReportQuery, 'range' | 'from' | 'to'>): string {
  if (query.from && query.to) return `từ ${query.from} đến ${query.to}`;
  if (query.from) return `từ ${query.from}`;
  if (query.to) return `đến ${query.to}`;
  return RANGE_LABEL[query.range];
}

/** Phần khoảng thời gian trong tên file: `week`, `2026-09-01_2026-09-30`… */
export function rangeSlug(query: Pick<ReportQuery, 'range' | 'from' | 'to'>): string {
  if (query.from || query.to) return `${query.from ?? 'start'}_${query.to ?? 'end'}`;
  return query.range;
}

/** Bỏ dấu tiếng Việt, chữ thường, chỉ giữ [a-z0-9-] để tên file an toàn (ASCII) */
export function slugify(text: string): string {
  const ascii = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'class';
}

/** `attachment; filename="ascii.xlsx"; filename*=UTF-8''...` (RFC 6266 / 5987) */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const entryInclude = {
  student: { select: { user: { select: { displayName: true } } } },
  createdBy: { select: { displayName: true } },
} satisfies Prisma.PointEntryInclude;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
    private readonly access: AccessService,
    private readonly ranking: RankingService,
  ) {}

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
      include: entryInclude,
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
    if (!cls) throw notFound('Không tìm thấy lớp');
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
    const p = this.time.parts(date);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(p.d)}/${pad(p.m)}/${p.y} ${pad(p.h)}:${pad(p.mi)}`;
  }
}
