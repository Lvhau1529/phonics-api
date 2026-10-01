import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildRankingPdf } from './pdf.writer';
import { contentDisposition, rangeLabel, rangeSlug, slugify } from './reports.service';
import {
  buildPointsWorkbook,
  buildRankingWorkbook,
  type PointsRow,
  type RankingRow,
  type ReportMeta,
} from './xlsx.writer';

const meta: ReportMeta = {
  className: 'Lớp K2A',
  rangeLabel: 'Tuần này',
  gameId: null,
  generatedAt: '01/10/2026 09:30',
};

const ranking: RankingRow[] = [
  { rank: 1, displayName: 'Đặng Ngọc Ánh', points: 120 },
  { rank: 1, displayName: 'Bảo Khánh', points: 120 },
  { rank: 3, displayName: 'Minh Quân', points: 95 },
];

async function load(buffer: Buffer): Promise<Workbook> {
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe('buildRankingWorkbook', () => {
  it('ghi tiêu đề, header ở dòng 4 và mỗi học sinh một dòng', async () => {
    const wb = await load(await buildRankingWorkbook(meta, ranking));
    const ws = wb.getWorksheet('Xếp hạng');
    expect(ws).toBeDefined();
    expect(ws!.getCell('A1').value).toBe('Xếp hạng lớp Lớp K2A');
    expect(String(ws!.getCell('A2').value)).toContain('Tuần này');
    expect(ws!.getRow(4).values).toEqual([undefined, 'STT', 'Hạng', 'Học sinh', 'Điểm']);
    expect(ws!.getRow(4).getCell(1).font?.bold).toBe(true);
    // 3 dòng tiêu đề/trống + 1 header + 3 dữ liệu
    expect(ws!.rowCount).toBe(7);
    expect(ws!.getRow(5).values).toEqual([undefined, 1, 1, 'Đặng Ngọc Ánh', 120]);
    expect(ws!.getRow(7).values).toEqual([undefined, 3, 3, 'Minh Quân', 95]);
    expect(ws!.autoFilter).toBe('A4:D7'); // exceljs đọc lại autoFilter dưới dạng chuỗi
  });

  it('lớp rỗng vẫn có header', async () => {
    const wb = await load(await buildRankingWorkbook(meta, []));
    expect(wb.getWorksheet('Xếp hạng')!.rowCount).toBe(4);
  });
});

describe('buildPointsWorkbook', () => {
  it('7 cột, loại điểm dịch sang tiếng Việt, GAME không người tạo = Hệ thống', async () => {
    const rows: PointsRow[] = [
      {
        date: '01/10/2026 08:00',
        studentName: 'Ánh',
        kind: 'GAME',
        gameId: 'bread-catcher',
        points: 8,
        note: null,
        createdByName: null,
      },
      {
        date: '30/09/2026 15:20',
        studentName: 'Quân',
        kind: 'BONUS',
        gameId: null,
        points: -5,
        note: 'Nói chuyện riêng',
        createdByName: 'Cô Lan',
      },
    ];
    const wb = await load(await buildPointsWorkbook({ ...meta, gameId: 'bread-catcher' }, rows));
    const ws = wb.getWorksheet('Sổ điểm')!;
    expect(ws.getRow(4).values).toEqual([
      undefined,
      'Ngày',
      'Học sinh',
      'Loại',
      'Game',
      'Điểm',
      'Ghi chú',
      'Người tạo',
    ]);
    expect(ws.rowCount).toBe(6);
    expect(ws.getRow(5).values).toEqual([
      undefined,
      '01/10/2026 08:00',
      'Ánh',
      'Chơi game',
      'bread-catcher',
      8,
      '',
      'Hệ thống',
    ]);
    expect(ws.getRow(6).values).toEqual([
      undefined,
      '30/09/2026 15:20',
      'Quân',
      'Thưởng',
      '',
      -5,
      'Nói chuyện riêng',
      'Cô Lan',
    ]);
    expect(String(ws.getCell('A2').value)).toContain('Game: bread-catcher');
  });
});

describe('buildRankingPdf', () => {
  it('sinh PDF hợp lệ với font Roboto (có dấu tiếng Việt)', async () => {
    const buffer = await buildRankingPdf(meta, ranking);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString('latin1')).toContain('Roboto');
  });
});

describe('tên file', () => {
  it('slugify bỏ dấu và ký tự lạ', () => {
    expect(slugify('Lớp K2A')).toBe('lop-k2a');
    expect(slugify('Đội Én Nhỏ (2026)')).toBe('doi-en-nho-2026');
    expect(slugify('!!!')).toBe('class');
  });

  it('rangeSlug / rangeLabel theo preset hoặc from–to', () => {
    expect(rangeSlug({ range: 'week' })).toBe('week');
    expect(rangeSlug({ range: 'all', from: '2026-09-01', to: '2026-09-30' })).toBe('2026-09-01_2026-09-30');
    expect(rangeLabel({ range: 'month' })).toBe('Tháng này');
    expect(rangeLabel({ range: 'all', from: '2026-09-01' })).toBe('từ 2026-09-01');
  });

  it('contentDisposition có cả filename ASCII và filename* UTF-8', () => {
    expect(contentDisposition('ranking-k2a-week.xlsx')).toBe(
      `attachment; filename="ranking-k2a-week.xlsx"; filename*=UTF-8''ranking-k2a-week.xlsx`,
    );
    expect(contentDisposition('xếp hạng.pdf')).toBe(
      `attachment; filename="x_p h_ng.pdf"; filename*=UTF-8''x%E1%BA%BFp%20h%E1%BA%A1ng.pdf`,
    );
  });
});
