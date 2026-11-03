import { type AttendanceMark } from '@phonics/contracts';
import { type Column, type Content, type TableCell, type TDocumentDefinitions } from 'pdfmake/interfaces';
import { dayjs } from '@/core/time/dayjs';
import { renderPdf } from '@/infrastructure/pdf/pdfmake';
import {
  type StatementLine,
  type StatementStudent,
  type TuitionStatement,
} from '@/modules/extra-lessons/utils/tuition-statement';
import { vietQrPayload } from '@/modules/extra-lessons/utils/vietqr';

/**
 * Phiếu báo học phí (A4, tiếng Việt — gửi phụ huynh). Mọi phần lấy từ cài đặt chỉ in khi đã điền: trường bỏ trống
 * không hiện, cột "Ca học" chỉ khi bật `showSlot`; cả khối chuyển khoản ẩn khi không có trường nào; mã VietQR cần đủ mã BIN + số tài khoản.
 */

const COLORS = {
  title: '#4C1D95',
  muted: '#6B7280',
  header: '#EDE9FE',
  zebra: '#F9FAFB',
  line: '#E5E7EB',
  box: '#F5F3FF',
} as const;

const MARK_LABEL: Record<AttendanceMark, string> = {
  PRESENT: 'Có mặt',
  ABSENT: 'Vắng',
  EXCUSED: 'Vắng có phép',
};

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export const formatVnd = (n: number): string => `${n.toLocaleString('vi-VN')} đ`;
const formatDate = (iso: string): string => dayjs(iso).format('DD/MM/YYYY');
const monthLabel = (month: string): string => dayjs(`${month}-01`).format('MM/YYYY');

const tableLayout = {
  fillColor: (rowIndex: number) => (rowIndex > 0 && rowIndex % 2 === 0 ? COLORS.zebra : null),
  hLineColor: () => COLORS.line,
  vLineColor: () => COLORS.line,
};

/** Dòng "Nhãn: giá trị" chỉ khi có giá trị */
function field(label: string, value: string | null | undefined, bold = false): Content[] {
  return value
    ? [
        {
          text: [
            { text: `${label}: `, color: COLORS.muted },
            { text: value, bold },
          ],
          margin: [0, 0, 0, 3],
        },
      ]
    : [];
}

function header(s: TuitionStatement): Content[] {
  const { orgName, orgAddress, orgPhone } = s.settings;
  const contact = [orgAddress, orgPhone && `ĐT: ${orgPhone}`].filter(Boolean).join(' · ');
  return [
    ...(orgName ? [{ text: orgName, style: 'org' } as Content] : []),
    ...(contact ? [{ text: contact, style: 'muted' } as Content] : []),
    { text: `PHIẾU BÁO HỌC PHÍ THÁNG ${monthLabel(s.month)}`, style: 'title' },
    {
      text: `Kính gửi: ${s.recipientName ? `Phụ huynh ${s.recipientName}` : 'Quý phụ huynh'}`,
      margin: [0, 0, 0, 10],
    },
  ];
}

/** Một cột của bảng buổi: tiêu đề, độ rộng, nội dung ô */
interface LineColumn {
  title: string;
  width: number | '*';
  align: 'left' | 'center' | 'right';
  cell: (l: StatementLine) => { text: string; color?: string; italics?: boolean };
}

/** Cột "Ca học" chỉ khi bật `showSlot`; cột cuối luôn là "Thành tiền" */
function lineColumns(showSlot: boolean): LineColumn[] {
  const columns: (LineColumn | false)[] = [
    {
      title: 'Ngày',
      width: 62,
      align: 'center',
      cell: (l) => {
        const d = dayjs(l.date);
        return { text: `${WEEKDAY[d.day()]} ${d.format('DD/MM')}${l.pending ? ' *' : ''}` };
      },
    },
    showSlot && {
      title: 'Ca học',
      width: '*',
      align: 'left',
      cell: (l) => ({ text: l.slotName ?? 'Buổi bù' }),
    },
    {
      title: 'Giờ',
      width: showSlot ? 66 : '*',
      align: 'center',
      cell: (l) => ({ text: `${l.startTime}–${l.endTime}` }),
    },
    {
      title: 'Điểm danh',
      width: 70,
      align: 'center',
      cell: (l) => ({ text: MARK_LABEL[l.mark], color: l.mark === 'PRESENT' ? undefined : COLORS.muted }),
    },
    { title: 'Đơn giá', width: 66, align: 'right', cell: (l) => ({ text: formatVnd(l.unitPrice) }) },
    {
      title: 'Thành tiền',
      width: 74,
      align: 'right',
      cell: (l) =>
        l.charged
          ? { text: formatVnd(l.amount) }
          : { text: 'Không tính', color: COLORS.muted, italics: true },
    },
  ];
  return columns.filter((c): c is LineColumn => !!c);
}

function studentBlock(st: StatementStudent, showSlot: boolean): Content[] {
  const name = st.englishName ? `${st.vietnameseName} (${st.englishName})` : st.vietnameseName;
  const columns = lineColumns(showSlot);
  const n = columns.length;
  const pad = (count: number): TableCell[] => Array.from({ length: count }, () => ({}));
  const body: TableCell[][] = [
    columns.map((c) => ({ text: c.title, style: 'th', alignment: c.align })),
    ...st.lines.map((l) => columns.map((c): TableCell => ({ ...c.cell(l), alignment: c.align }))),
  ];
  if (!st.lines.length)
    body.push([
      { text: 'Không có buổi học thêm trong tháng', colSpan: n, alignment: 'center', color: COLORS.muted },
      ...pad(n - 1),
    ]);
  body.push([
    { text: `Cộng: ${st.chargedCount} buổi tính phí / ${st.lines.length} buổi`, colSpan: n - 1, bold: true },
    ...pad(n - 2),
    { text: formatVnd(st.total), alignment: 'right', bold: true },
  ]);
  return [
    { text: `Học sinh: ${name}`, style: 'student' },
    { table: { headerRows: 1, widths: columns.map((c) => c.width), body }, layout: tableLayout },
  ];
}

function summary(s: TuitionStatement): Content {
  return {
    table: {
      widths: ['*', 'auto'],
      body: [
        [
          { text: 'TỔNG CẦN THANH TOÁN', bold: true, fontSize: 12 },
          { text: formatVnd(s.total), bold: true, fontSize: 14, color: COLORS.title, alignment: 'right' },
        ],
        ...(s.dueDate
          ? [[{ text: 'Hạn thanh toán' }, { text: formatDate(s.dueDate), bold: true, alignment: 'right' }]]
          : []),
      ] as TableCell[][],
    },
    layout: {
      fillColor: () => COLORS.box,
      hLineColor: () => COLORS.line,
      vLineColor: () => COLORS.line,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 8,
      paddingRight: () => 8,
    },
    margin: [0, 14, 0, 0],
  };
}

/** Khối chuyển khoản: chỉ các trường đã cài; QR khi có BIN + số tài khoản */
function payment(s: TuitionStatement): Content[] {
  const { bankName, bankBin, accountNo, accountName } = s.settings;
  const lines = [
    ...field('Ngân hàng', bankName),
    ...field('Số tài khoản', accountNo, true),
    ...field('Chủ tài khoản', accountName, true),
    ...field('Số tiền', s.total > 0 ? formatVnd(s.total) : null, true),
    ...field('Nội dung chuyển khoản', s.transferContent, true),
  ];
  const hasBank = !!(bankName || accountNo || accountName);
  if (!hasBank && !s.transferContent) return [];
  const qr: Column | null =
    bankBin && accountNo
      ? {
          stack: [
            {
              qr: vietQrPayload({ bin: bankBin, accountNo, amount: s.total, content: s.transferContent }),
              fit: 120,
              alignment: 'center',
            },
            { text: 'Quét mã bằng app ngân hàng', style: 'muted', alignment: 'center', margin: [0, 4, 0, 0] },
          ],
          width: 140,
        }
      : null;
  return [
    { text: 'THÔNG TIN CHUYỂN KHOẢN', style: 'section' },
    qr ? { columns: [{ stack: lines, width: '*' }, qr], columnGap: 16 } : { stack: lines },
  ];
}

export function tuitionStatementDocument(s: TuitionStatement): TDocumentDefinitions {
  const notes: Content[] = [
    ...(s.hasPending
      ? [
          {
            text: '(*) Buổi giáo viên chưa xác nhận điểm danh — số tiền có thể thay đổi.',
            style: 'muted',
          } as Content,
        ]
      : []),
    ...(s.settings.note ? [{ text: s.settings.note, margin: [0, 8, 0, 0] } as Content] : []),
  ];
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 48],
    info: {
      title: `Phiếu báo học phí tháng ${monthLabel(s.month)}`,
      author: s.settings.orgName ?? undefined,
    },
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      org: { fontSize: 13, bold: true, color: COLORS.title },
      title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 14, 0, 12] },
      student: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] },
      section: { fontSize: 11, bold: true, color: COLORS.title, margin: [0, 16, 0, 6] },
      muted: { fontSize: 9, color: COLORS.muted },
      th: { bold: true, fillColor: COLORS.header },
    },
    content: [
      ...header(s),
      ...s.students.flatMap((st) => studentBlock(st, s.settings.showSlot)),
      summary(s),
      ...(notes.length ? [{ stack: notes, margin: [0, 6, 0, 0] } as Content] : []),
      ...payment(s),
    ],
    footer: (currentPage, pageCount) => ({
      text: `Xuất lúc ${s.generatedAt} · trang ${currentPage}/${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: COLORS.muted,
      margin: [0, 16, 0, 0],
    }),
  };
}

export function buildTuitionStatementPdf(s: TuitionStatement): Promise<Buffer> {
  return renderPdf(tuitionStatementDocument(s));
}
