import { Workbook } from 'exceljs';

export interface AssignmentResultsMeta {
  worksheetTitle: string;
  className: string;
  scheduledFor: string;
  /** Đã định dạng theo APP_TIMEZONE */
  generatedAt: string;
}

export interface AssignmentResultColumn {
  worksheetItemId: string;
  /** "P1-Q2 (MULTIPLE_CHOICE)" */
  label: string;
  points: number;
}

export interface AssignmentResultRow {
  rank: number | null;
  displayName: string;
  status: string;
  attemptNo: number | null;
  submittedAt: string | null;
  late: boolean;
  autoScore: number | null;
  manualScore: number | null;
  totalScore: number | null;
  maxScore: number;
  percent: number | null;
  /** Điểm từng câu theo thứ tự `columns` (null = chưa trả lời) */
  itemScores: (number | null)[];
}

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } } as const;
const STATUS_LABEL: Record<string, string> = {
  MISSING: 'Chưa làm',
  IN_PROGRESS: 'Đang làm',
  SUBMITTED: 'Chờ chấm',
  GRADED: 'Đã chấm',
};

/** Bảng kết quả một bài giao: mỗi học sinh một dòng, kèm điểm từng câu */
export async function buildAssignmentResultsWorkbook(
  meta: AssignmentResultsMeta,
  columns: readonly AssignmentResultColumn[],
  rows: readonly AssignmentResultRow[],
): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Kết quả');
  const fixed = [
    'Hạng',
    'Học sinh',
    'Trạng thái',
    'Lần',
    'Nộp lúc',
    'Muộn',
    'Tự chấm',
    'GV chấm',
    'Tổng',
    'Tối đa',
    '%',
  ];
  const total = fixed.length + columns.length;

  ws.mergeCells(1, 1, 1, total);
  const title = ws.getCell(1, 1);
  title.value = `Kết quả: ${meta.worksheetTitle}`;
  title.font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, total);
  const sub = ws.getCell(2, 1);
  sub.value = `Lớp: ${meta.className} · Ngày: ${meta.scheduledFor} · Xuất lúc: ${meta.generatedAt}`;
  sub.font = { italic: true, color: { argb: 'FF6B7280' } };

  const header = ws.getRow(4);
  [...fixed, ...columns.map((c) => `${c.label} /${c.points}`)].forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin' } };
  });
  header.commit();

  rows.forEach((r, i) => {
    const row = ws.getRow(5 + i);
    const values: (string | number | null)[] = [
      r.rank,
      r.displayName,
      STATUS_LABEL[r.status] ?? r.status,
      r.attemptNo,
      r.submittedAt,
      r.late ? 'x' : '',
      r.autoScore,
      r.manualScore,
      r.totalScore,
      r.maxScore,
      r.percent === null ? null : Math.round(r.percent * 100),
      ...r.itemScores,
    ];
    values.forEach((v, j) => {
      row.getCell(j + 1).value = v;
    });
    row.commit();
  });

  ws.columns = [
    { width: 7 },
    { width: 24 },
    { width: 12 },
    { width: 6 },
    { width: 18 },
    { width: 7 },
    { width: 9 },
    { width: 9 },
    { width: 8 },
    { width: 8 },
    { width: 6 },
    ...columns.map(() => ({ width: 10 })),
  ];
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
