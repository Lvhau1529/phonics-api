/**
 * Chuẩn hoá số điện thoại về E.164 (để sau này gửi Zalo ZNS / SMS): bỏ ký tự phân cách, số Việt Nam `0912…` →
 * `+84912…`, `84912…` → `+84912…`. Số khác giữ nguyên chữ số. Trùng logic `pg_temp.norm_phone` của migration
 * `family_accounts`.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^0-9+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return `+${digits.replace(/\+/g, '')}`;
  if (digits.startsWith('84') && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith('0')) return `+84${digits.slice(1)}`;
  return digits;
}
