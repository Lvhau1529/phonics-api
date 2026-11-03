/** Dựng dữ liệu phiếu báo học phí một tháng (gộp các bé cùng phụ huynh nhận học phí) — hàm thuần */
import {
  type AttendanceMark,
  type AttendanceSessionStatus,
  type ExtraSlotKind,
  type TuitionSettings,
} from '@phonics/contracts';
import { dayjs, ISO_DATE } from '@/core/time/dayjs';

/** Nội dung chuyển khoản tối đa (app ngân hàng thường cắt / từ chối chuỗi dài) */
export const TRANSFER_CONTENT_MAX = 50;

export interface StatementRecordRow {
  studentId: string;
  mark: AttendanceMark;
  charged: boolean;
  unitPrice: number;
  session: {
    date: string;
    startTime: string;
    endTime: string;
    status: AttendanceSessionStatus;
    kind: ExtraSlotKind;
    /** Thông tin ca hiện tại — phiếu luôn in theo ca đã sửa mới nhất */
    slot: { name: string; kind: ExtraSlotKind; startTime: string; endTime: string } | null;
  };
}

export interface StatementStudentRow {
  id: string;
  vietnameseName: string;
  englishName: string | null;
}

export interface StatementLine {
  kind: ExtraSlotKind;
  date: string;
  slotName: string | null;
  startTime: string;
  endTime: string;
  mark: AttendanceMark;
  charged: boolean;
  unitPrice: number;
  /** = đơn giá khi tính phí, 0 khi không */
  amount: number;
  /** Buổi GV chưa xác nhận — số tiền có thể đổi */
  pending: boolean;
}

/** Một bảng trên phiếu: các buổi cùng loại ca của một bé */
export interface StatementSection {
  kind: ExtraSlotKind;
  /** Dòng in ra — kèm cuối buổi chỉ gồm buổi có học (hoặc vẫn tính phí) */
  lines: StatementLine[];
  chargedCount: number;
  total: number;
}

export interface StatementStudent extends StatementStudentRow {
  /** Mọi buổi (không gồm buổi huỷ), kể cả dòng không in */
  lines: StatementLine[];
  /** Theo thứ tự học thêm → kèm cuối buổi; bỏ loại không có dòng nào để in */
  sections: StatementSection[];
  chargedCount: number;
  total: number;
}

const SECTION_ORDER: readonly ExtraSlotKind[] = ['EXTRA_CLASS', 'TUTORING'];

/** Kèm cuối buổi chỉ báo buổi có học; buổi vắng mà vẫn tính phí (ghi đè) vẫn in để khớp tổng tiền */
export function visibleLine(l: StatementLine): boolean {
  return l.kind !== 'TUTORING' || l.mark === 'PRESENT' || l.charged;
}

export function statementSections(lines: readonly StatementLine[]): StatementSection[] {
  return SECTION_ORDER.flatMap((kind) => {
    const shown = lines.filter((l) => l.kind === kind && visibleLine(l));
    if (!shown.length) return [];
    return [
      {
        kind,
        lines: shown,
        chargedCount: shown.filter((l) => l.charged).length,
        total: shown.reduce((sum, l) => sum + l.amount, 0),
      },
    ];
  });
}

export interface TuitionStatement {
  month: string;
  recipientName: string | null;
  students: StatementStudent[];
  total: number;
  hasPending: boolean;
  /** Đã điền biến; null = không cài mẫu */
  transferContent: string | null;
  /** 'YYYY-MM-DD'; null = không cài hạn đóng */
  dueDate: string | null;
  settings: Omit<TuitionSettings, 'updatedAt'>;
  generatedAt: string;
}

/** Bỏ dấu, viết hoa, chỉ giữ chữ / số / khoảng trắng (an toàn cho nội dung chuyển khoản) */
export function asciiUpper(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** '+84912345678' → '0912345678' */
export function localPhone(phone: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return phone.startsWith('+84') ? `0${digits.slice(2)}` : digits;
}

/** Điền `{month}` (T10 2026), `{students}` (tên các bé), `{phone}` (SĐT phụ huynh) rồi chuẩn hoá ASCII */
export function renderTransferContent(
  template: string | null,
  vars: { month: string; students: readonly string[]; phone: string | null },
): string | null {
  if (!template) return null;
  const [y, m] = vars.month.split('-');
  const text = template
    .replaceAll('{month}', `T${m} ${y}`)
    .replaceAll('{students}', vars.students.join(' '))
    .replaceAll('{phone}', localPhone(vars.phone));
  return asciiUpper(text).slice(0, TRANSFER_CONTENT_MAX).trim() || null;
}

/** Hạn đóng: ngày `dueDay` của tháng sau tháng tính phí */
export function statementDueDate(month: string, dueDay: number | null): string | null {
  if (!dueDay) return null;
  return dayjs(`${month}-01`).add(1, 'month').date(dueDay).format(ISO_DATE);
}

/** Tên ngắn của bé cho nội dung chuyển khoản: tên tiếng Anh, không có thì tên (từ cuối) tiếng Việt */
export function shortName(s: StatementStudentRow): string {
  return s.englishName ?? s.vietnameseName.trim().split(/\s+/).at(-1) ?? s.vietnameseName;
}

export function buildStatement(input: {
  month: string;
  recipient: { fullName: string; phone: string | null } | null;
  students: readonly StatementStudentRow[];
  records: readonly StatementRecordRow[];
  settings: Omit<TuitionSettings, 'updatedAt'>;
  generatedAt: string;
}): TuitionStatement {
  const students = input.students.map((s): StatementStudent => {
    const lines = input.records
      .filter((r) => r.studentId === s.id)
      // Buổi theo ca: tên / loại / giờ lấy từ ca hiện tại (sửa ca là phiếu đổi theo, kể cả buổi đã xác nhận); buổi bù
      // dùng thông tin của chính buổi. Tiền luôn theo đơn giá đã chốt trên bản ghi.
      .map((r): StatementLine => ({
        kind: r.session.slot?.kind ?? r.session.kind,
        date: r.session.date,
        slotName: r.session.slot?.name ?? null,
        startTime: r.session.slot?.startTime ?? r.session.startTime,
        endTime: r.session.slot?.endTime ?? r.session.endTime,
        mark: r.mark,
        charged: r.charged,
        unitPrice: r.unitPrice,
        amount: r.charged ? r.unitPrice : 0,
        pending: r.session.status === 'PENDING',
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    return {
      ...s,
      lines,
      sections: statementSections(lines),
      chargedCount: lines.filter((l) => l.charged).length,
      total: lines.reduce((sum, l) => sum + l.amount, 0),
    };
  });
  return {
    month: input.month,
    recipientName: input.recipient?.fullName ?? null,
    students,
    total: students.reduce((sum, s) => sum + s.total, 0),
    hasPending: students.some((s) => s.lines.some((l) => l.pending && l.charged)),
    transferContent: renderTransferContent(input.settings.transferContent, {
      month: input.month,
      students: students.map(shortName),
      phone: input.recipient?.phone ?? null,
    }),
    dueDate: statementDueDate(input.month, input.settings.dueDay),
    settings: input.settings,
    generatedAt: input.generatedAt,
  };
}
