import { Workbook, type Worksheet } from 'exceljs';

/** Thông tin chung in ở đầu mỗi báo cáo */
export interface ReportMeta {
  className: string;
  /** "Tất cả", "Tuần này", "từ 2026-09-01 đến 2026-09-30"… */
  rangeLabel: string;
  /** null = mọi game */
  gameId: string | null;
  /** Đã định dạng theo APP_TIMEZONE */
  generatedAt: string;
}

export interface RankingRow {
  rank: number;
  displayName: string;
  points: number;
}

export interface PointsRow {
  /** Đã định dạng theo APP_TIMEZONE */
  date: string;
  studentName: string;
  kind: 'GAME' | 'BONUS';
  gameId: string | null;
  points: number;
  note: string | null;
  createdByName: string | null;
}

export const KIND_LABEL: Record<PointsRow['kind'], string> = { GAME: 'Chơi game', BONUS: 'Thưởng' };

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } } as const;

/** Dòng tiêu đề + dòng mô tả (khoảng / game / thời điểm xuất), trả về số dòng đã dùng */
function writeTitle(ws: Worksheet, title: string, meta: ReportMeta, columns: number): number {
  ws.mergeCells(1, 1, 1, columns);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14 };

  ws.mergeCells(2, 1, 2, columns);
  const metaCell = ws.getCell(2, 1);
  metaCell.value = `Khoảng: ${meta.rangeLabel} · Game: ${meta.gameId ?? 'Tất cả'} · Xuất lúc: ${meta.generatedAt}`;
  metaCell.font = { italic: true, color: { argb: 'FF6B7280' } };
  return 3; // dòng 3 để trống, dữ liệu từ dòng 4
}

function writeHeader(ws: Worksheet, rowIndex: number, labels: string[]): void {
  const row = ws.getRow(rowIndex);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin' } };
  });
  row.commit();
}

/** Sheet "Xếp hạng": STT, Hạng, Học sinh, Điểm */
export async function buildRankingWorkbook(meta: ReportMeta, rows: readonly RankingRow[]): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'Phonics Arcade';
  wb.created = new Date();
  const ws = wb.addWorksheet('Xếp hạng', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.columns = [{ width: 6 }, { width: 8 }, { width: 32 }, { width: 10 }];

  const headerRow = writeTitle(ws, `Xếp hạng lớp ${meta.className}`, meta, 4) + 1;
  writeHeader(ws, headerRow, ['STT', 'Hạng', 'Học sinh', 'Điểm']);
  rows.forEach((r, i) => {
    ws.addRow([i + 1, r.rank, r.displayName, r.points]);
  });
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: 4 } };
  ws.getColumn(4).numFmt = '#,##0';

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Sheet "Sổ điểm": Ngày, Học sinh, Loại, Game, Điểm, Ghi chú, Người tạo */
export async function buildPointsWorkbook(meta: ReportMeta, rows: readonly PointsRow[]): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'Phonics Arcade';
  wb.created = new Date();
  const ws = wb.addWorksheet('Sổ điểm', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.columns = [
    { width: 18 },
    { width: 28 },
    { width: 12 },
    { width: 16 },
    { width: 8 },
    { width: 40 },
    { width: 24 },
  ];

  const headerRow = writeTitle(ws, `Sổ điểm lớp ${meta.className}`, meta, 7) + 1;
  writeHeader(ws, headerRow, ['Ngày', 'Học sinh', 'Loại', 'Game', 'Điểm', 'Ghi chú', 'Người tạo']);
  for (const r of rows) {
    ws.addRow([
      r.date,
      r.studentName,
      KIND_LABEL[r.kind],
      r.gameId ?? '',
      r.points,
      r.note ?? '',
      r.createdByName ?? (r.kind === 'GAME' ? 'Hệ thống' : ''),
    ]);
  }
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: 7 } };
  ws.getColumn(5).numFmt = '#,##0';

  return Buffer.from(await wb.xlsx.writeBuffer());
}
