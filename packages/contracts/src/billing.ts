import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
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

export const BankBin = z.string().regex(/^\d{6}$/, ValidationMessage.bankBinFormat);
export const BankAccountNo = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]{4,30}$/, ValidationMessage.bankAccountFormat);

/**
 * Cài đặt phiếu học phí (một bản cho cả hệ thống). Trường null = **không in** lên phiếu; chưa cài = mọi trường null,
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
});
export type UpdateTuitionSettings = z.infer<typeof UpdateTuitionSettings>;

/** Xuất phiếu báo học phí một tháng (gộp các bé cùng phụ huynh nhận học phí) */
export const TuitionStatementQuery = z.object({ month: YearMonth });
export type TuitionStatementQuery = z.infer<typeof TuitionStatementQuery>;
