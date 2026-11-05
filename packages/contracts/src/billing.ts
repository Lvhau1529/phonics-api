import { z } from 'zod';
import { IsoDate, IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { ValidationMessage } from './common/validation-messages.js';
import { YearMonth } from './attendance.js';
import { Phone } from './users.js';

/**
 * Phiếu báo học phí cho phụ huynh (PDF, tạm tính từ điểm danh — trước khi có phiếu tháng §7) + cài đặt in trên
 * phiếu: tên trung tâm, tài khoản nhận chuyển khoản (kèm mã VietQR), nội dung chuyển khoản, hạn đóng.
 */

/** Ngân hàng phổ biến + mã BIN (NAPAS) — BIN dùng sinh mã VietQR; ngân hàng khác nhập tên + BIN tay */
export const VN_BANKS = [
  { bin: '970436', code: 'VCB', name: 'Vietcombank' },
  { bin: '970415', code: 'ICB', name: 'VietinBank' },
  { bin: '970418', code: 'BIDV', name: 'BIDV' },
  { bin: '970405', code: 'VBA', name: 'Agribank' },
  { bin: '970407', code: 'TCB', name: 'Techcombank' },
  { bin: '970422', code: 'MB', name: 'MB Bank' },
  { bin: '970416', code: 'ACB', name: 'ACB' },
  { bin: '970432', code: 'VPB', name: 'VPBank' },
  { bin: '970423', code: 'TPB', name: 'TPBank' },
  { bin: '970403', code: 'STB', name: 'Sacombank' },
  { bin: '970441', code: 'VIB', name: 'VIB' },
  { bin: '970437', code: 'HDB', name: 'HDBank' },
  { bin: '970443', code: 'SHB', name: 'SHB' },
  { bin: '970448', code: 'OCB', name: 'OCB' },
  { bin: '970426', code: 'MSB', name: 'MSB' },
  { bin: '970440', code: 'SEAB', name: 'SeABank' },
  { bin: '970431', code: 'EIB', name: 'Eximbank' },
  { bin: '970449', code: 'LPB', name: 'LPBank' },
] as const;

/** Biến dùng được trong mẫu nội dung chuyển khoản */
export const TRANSFER_CONTENT_VARS = ['{month}', '{students}', '{phone}'] as const;
/** Gợi ý mẫu nội dung chuyển khoản (admin điền sẵn khi chưa cài) */
export const SUGGESTED_TRANSFER_CONTENT = 'HP {month} {students}';

/** Độ dài tối đa mẫu tin nhắn thông báo học phí */
export const NOTICE_TEMPLATE_MAX = 1000;

export const BankBin = z.string().regex(/^\d{6}$/, ValidationMessage.bankBinFormat);
export const BankAccountNo = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]{4,30}$/, ValidationMessage.bankAccountFormat);

/**
 * Cài đặt phiếu học phí (một bản cho cả hệ thống). Trường null / `showSlot` false = **không in** lên phiếu; chưa cài = mọi trường null,
 * `updatedAt` null. Mã VietQR chỉ in khi có đủ `bankBin` + `accountNo`.
 */
export const TuitionSettings = z.object({
  orgName: z.string().nullable(),
  orgAddress: z.string().nullable(),
  orgPhone: z.string().nullable(),
  bankBin: z.string().nullable(),
  bankName: z.string().nullable(),
  accountNo: z.string().nullable(),
  accountName: z.string().nullable(),
  /** Mẫu nội dung chuyển khoản, có thể chứa `{month}` / `{students}` / `{phone}` */
  transferContent: z.string().nullable(),
  /** Hạn đóng: ngày này của tháng sau tháng tính phí */
  dueDay: z.int().nullable(),
  /** Ghi chú cuối phiếu */
  note: z.string().nullable(),
  /** In cột "Ca học" trong bảng buổi (mặc định không) */
  showSlot: z.boolean(),
  /** Mẫu tin nhắn thông báo học phí gửi phụ huynh qua Zalo (từ 1.20.0); null = dùng `DEFAULT_NOTICE_TEMPLATE` */
  noticeTemplate: z.string().nullable(),
  updatedAt: IsoDateTime.nullable(),
});
export type TuitionSettings = z.infer<typeof TuitionSettings>;

/** PUT thay cả bản cài đặt; trường bỏ trống (không gửi) = không in lên phiếu */
export const UpdateTuitionSettings = z.strictObject({
  orgName: z.string().trim().min(1).max(100).optional(),
  orgAddress: z.string().trim().min(1).max(200).optional(),
  orgPhone: Phone.optional(),
  bankBin: BankBin.optional(),
  bankName: z.string().trim().min(1).max(60).optional(),
  accountNo: BankAccountNo.optional(),
  accountName: z.string().trim().min(1).max(60).optional(),
  transferContent: z.string().trim().min(1).max(60).optional(),
  dueDay: z.int().min(1).max(28).optional(),
  note: z.string().trim().min(1).max(500).optional(),
  showSlot: z.boolean().optional(),
  noticeTemplate: z.string().trim().min(1).max(NOTICE_TEMPLATE_MAX).optional(),
});
export type UpdateTuitionSettings = z.infer<typeof UpdateTuitionSettings>;

/** Xuất phiếu báo học phí một tháng (gộp các bé cùng phụ huynh nhận học phí) */
export const TuitionStatementQuery = z.object({ month: YearMonth });
export type TuitionStatementQuery = z.infer<typeof TuitionStatementQuery>;

// ---------- Thông báo học phí qua Zalo (từ 1.20.0) ----------
//
// Admin chọn tháng (+ lớp), hệ thống soạn sẵn tin nhắn cho từng phụ huynh nhận học phí; admin bấm "Sao chép" rồi
// "Mở Zalo" (`zaloChatUrl`) để dán và gửi bằng Zalo cá nhân. Không gửi tự động, không lưu trạng thái đã gửi.

/** Biến dùng được trong mẫu tin nhắn */
export const NOTICE_TEMPLATE_VARS = [
  '{students}',
  '{parent}',
  '{month}',
  '{amount}',
  '{dueDate}',
  '{bank}',
  '{accountNo}',
  '{accountName}',
  '{transferContent}',
  '{orgName}',
] as const;
export type NoticeTemplateVar = (typeof NOTICE_TEMPLATE_VARS)[number];

/** Mẫu mặc định khi chưa cài. Dòng chứa biến không có giá trị (vd chưa cài hạn đóng) tự bỏ khi soạn */
export const DEFAULT_NOTICE_TEMPLATE = [
  'Kính gửi phụ huynh bé {students}, học phí tháng {month} là {amount}.',
  'Vui lòng chuyển khoản trước ngày {dueDate}.',
  'STK: {accountNo} - {bank} - {accountName}',
  'Nội dung CK: {transferContent}',
  'Cảm ơn quý phụ huynh!',
].join('\n');

/** `800000` → `800.000đ` (cố định kiểu Việt Nam, không phụ thuộc ngôn ngữ giao diện) */
export function formatVnd(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${String(Math.abs(Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

/** Tên bé trong tin nhắn: `Nguyễn Văn An (Andy)` — tên tiếng Anh trong ngoặc khi có */
export function noticeStudentName(s: { vietnameseName: string; englishName: string | null }): string {
  const vi = s.vietnameseName.trim();
  const en = s.englishName?.trim();
  return en && en.toLowerCase() !== vi.toLowerCase() ? `${vi} (${en})` : vi;
}

export interface NoticeVars {
  students: readonly { vietnameseName: string; englishName: string | null }[];
  parent: string | null;
  /** 'YYYY-MM' */
  month: string;
  amount: number;
  /** 'YYYY-MM-DD' | null */
  dueDate: string | null;
  bank: string | null;
  accountNo: string | null;
  accountName: string | null;
  transferContent: string | null;
  orgName: string | null;
}

/**
 * Soạn tin nhắn từ mẫu: điền `{biến}`; dòng có biến rỗng (vd chưa cài STK, chưa có hạn đóng) bị bỏ cả dòng để tin
 * nhắn không còn chỗ trống. Biến không biết giữ nguyên. Mẫu rỗng → `DEFAULT_NOTICE_TEMPLATE`.
 */
export function renderTuitionNotice(template: string | null | undefined, vars: NoticeVars): string {
  const ymd = (iso: string) => iso.split('-').reverse().join('/');
  const [year, month] = vars.month.split('-');
  const values: Record<NoticeTemplateVar, string> = {
    '{students}': vars.students.map(noticeStudentName).join(', '),
    '{parent}': vars.parent?.trim() ?? '',
    '{month}': `${month}/${year}`,
    '{amount}': formatVnd(vars.amount),
    '{dueDate}': vars.dueDate ? ymd(vars.dueDate) : '',
    '{bank}': vars.bank?.trim() ?? '',
    '{accountNo}': vars.accountNo?.trim() ?? '',
    '{accountName}': vars.accountName?.trim() ?? '',
    '{transferContent}': vars.transferContent?.trim() ?? '',
    '{orgName}': vars.orgName?.trim() ?? '',
  };
  const source = template?.trim() ? template : DEFAULT_NOTICE_TEMPLATE;
  return source
    .split(/\r?\n/)
    .flatMap((line) => {
      const used = NOTICE_TEMPLATE_VARS.filter((v) => line.includes(v));
      if (used.some((v) => !values[v])) return [];
      return [used.reduce((text, v) => text.replaceAll(v, values[v]), line).trimEnd()];
    })
    .join('\n')
    .trim();
}

/** Danh sách thông báo một tháng; `classId` = chỉ các bé đang học lớp đó (bỏ trống = mọi bé có học thêm trong tháng) */
export const TuitionNoticeQuery = z.object({ month: YearMonth, classId: Id.optional() });
export type TuitionNoticeQuery = z.infer<typeof TuitionNoticeQuery>;

export const TuitionNoticeStudent = z.object({
  id: Id,
  vietnameseName: z.string(),
  englishName: z.string().nullable(),
  /** Lớp đang học (null = chưa vào lớp) */
  className: z.string().nullable(),
  /** Tiền học thêm tháng đó, tạm tính từ điểm danh (như phiếu PDF) */
  confirmedTotal: z.int(),
  pendingTotal: z.int(),
});
export type TuitionNoticeStudent = z.infer<typeof TuitionNoticeStudent>;

/** Một tin nhắn = một phụ huynh nhận học phí (gộp anh chị em); bé chưa có phụ huynh nhận học phí = một dòng riêng */
export const TuitionNotice = z.object({
  /** Khoá ổn định: id phụ huynh, hoặc `student:<id>` khi bé chưa có phụ huynh nhận học phí */
  key: z.string(),
  guardianId: Id.nullable(),
  guardianName: z.string().nullable(),
  /** E.164 như đã lưu (null = chưa có) — hiển thị / link Zalo qua `formatPhone` / `zaloChatUrl` */
  phone: z.string().nullable(),
  students: z.array(TuitionNoticeStudent),
  confirmedTotal: z.int(),
  pendingTotal: z.int(),
  /** Nội dung chuyển khoản đã điền theo cài đặt (như trên phiếu PDF); null = chưa cài mẫu */
  transferContent: z.string().nullable(),
});
export type TuitionNotice = z.infer<typeof TuitionNotice>;

export const TuitionNoticesResponse = z.object({
  month: YearMonth,
  classId: Id.nullable(),
  /** Hạn đóng theo cài đặt (ngày `dueDay` tháng sau); null = chưa cài */
  dueDate: IsoDate.nullable(),
  items: z.array(TuitionNotice),
});
export type TuitionNoticesResponse = z.infer<typeof TuitionNoticesResponse>;
