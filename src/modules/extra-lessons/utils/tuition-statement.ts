/** Dựng dữ liệu phiếu báo học phí một tháng (gộp các bé cùng phụ huynh nhận học phí) — hàm thuần */
import { type AttendanceMark, type AttendanceSessionStatus, type TuitionSettings } from '@phonics/contracts';
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
    slot: { name: string } | null;
  };
}

export interface StatementStudentRow {
  id: string;
  vietnameseName: string;
  englishName: string | null;
}

export interface StatementLine {
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

export interface StatementStudent extends StatementStudentRow {
  lines: StatementLine[];
  chargedCount: number;
  total: number;
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
      .map((r): StatementLine => ({
        date: r.session.date,
        slotName: r.session.slot?.name ?? null,
        startTime: r.session.startTime,
        endTime: r.session.endTime,
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
