import { type RangePreset, type ReportQuery } from '@phonics/contracts';

export const RANGE_LABEL: Record<RangePreset, string> = {
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
