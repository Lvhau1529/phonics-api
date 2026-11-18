import { isValidPhone, normalizePhone } from '@phonics/contracts';

export type PhoneRow = { id: string; fullName: string; phone: string };
export type PhoneChange = PhoneRow & { next: string };

/**
 * Chia số đã lưu thành: số cần ghi lại theo dạng chuẩn (`normalizePhone` khác giá trị đang lưu) và số không hợp lệ
 * (không chuẩn hoá được — sửa tay ở admin).
 */
export function planPhoneChanges(rows: PhoneRow[]): { changes: PhoneChange[]; invalid: PhoneRow[] } {
  const changes = rows.flatMap((row) => {
    const next = normalizePhone(row.phone);
    return next && next !== row.phone ? [{ ...row, next }] : [];
  });
  const invalid = rows.filter((row) => !isValidPhone(row.phone));
  return { changes, invalid };
}
