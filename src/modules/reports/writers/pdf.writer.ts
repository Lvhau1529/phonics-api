import path from 'node:path';
import pdfmake from 'pdfmake';
import robotoFonts from 'pdfmake/fonts/Roboto';
import { type TableCell, type TDocumentDefinitions } from 'pdfmake/interfaces';
import { type RankingRow, type ReportMeta } from './xlsx.writer';

/**
 * pdfmake 0.3 (Node): instance toàn cục, font đọc từ file .ttf đi kèm gói (Roboto có đủ dấu tiếng Việt).
 * Khoá truy cập file / URL: chỉ cho đọc trong thư mục font của pdfmake.
 */
const FONT_DIR = path.resolve(path.dirname(robotoFonts.Roboto.normal));
pdfmake.addFonts(robotoFonts);
pdfmake.setLocalAccessPolicy((file) => path.resolve(file).startsWith(FONT_DIR));
pdfmake.setUrlAccessPolicy(() => false);

const COLORS = { title: '#4C1D95', muted: '#6B7280', header: '#EDE9FE', zebra: '#F9FAFB' } as const;

/** Bảng xếp hạng lớp: tiêu đề, mô tả, bảng (STT, Hạng, Học sinh, Điểm), số trang ở chân */
export function rankingDocument(meta: ReportMeta, rows: readonly RankingRow[]): TDocumentDefinitions {
  const header: TableCell[] = ['STT', 'Hạng', 'Học sinh', 'Điểm'].map((text, i) => ({
    text,
    style: 'th',
    alignment: i === 2 ? 'left' : 'center',
  }));
  const body: TableCell[][] = [
    header,
    ...rows.map((r, i): TableCell[] => [
      { text: String(i + 1), alignment: 'center' },
      { text: String(r.rank), alignment: 'center', bold: r.rank <= 3 },
      { text: r.displayName },
      { text: r.points.toLocaleString('vi-VN'), alignment: 'right' },
    ]),
  ];
  if (!rows.length)
    body.push([
      { text: 'Lớp chưa có học sinh', colSpan: 4, alignment: 'center', color: COLORS.muted },
      {},
      {},
      {},
    ]);

  return {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 48],
    info: { title: `Xếp hạng lớp ${meta.className}`, author: 'Phonics Arcade' },
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      title: { fontSize: 16, bold: true, color: COLORS.title, margin: [0, 0, 0, 4] },
      meta: { fontSize: 9, color: COLORS.muted, margin: [0, 0, 0, 12] },
      th: { bold: true, fillColor: COLORS.header },
    },
    content: [
      { text: `Xếp hạng lớp ${meta.className}`, style: 'title' },
      {
        text: `Khoảng: ${meta.rangeLabel} · Game: ${meta.gameId ?? 'Tất cả'} · Xuất lúc: ${meta.generatedAt}`,
        style: 'meta',
      },
      {
        table: { headerRows: 1, widths: [36, 40, '*', 60], body },
        layout: {
          fillColor: (rowIndex) => (rowIndex > 0 && rowIndex % 2 === 0 ? COLORS.zebra : null),
          hLineColor: () => '#E5E7EB',
          vLineColor: () => '#E5E7EB',
        },
      },
    ],
    footer: (currentPage, pageCount) => ({
      text: `Phonics Arcade · trang ${currentPage}/${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: COLORS.muted,
      margin: [0, 16, 0, 0],
    }),
  };
}

/** Sinh PDF thành Buffer (pdfmake gom stream của pdfkit) */
export async function buildRankingPdf(meta: ReportMeta, rows: readonly RankingRow[]): Promise<Buffer> {
  return pdfmake.createPdf(rankingDocument(meta, rows)).getBuffer();
}
