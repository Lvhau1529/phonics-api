/**
 * Số điện thoại: một nguồn sự thật cho API (chuẩn hoá trước khi lưu), admin (hiển thị, link Zalo) và game.
 * Dạng lưu là E.164 (`+84912345678`); dạng hiển thị / gửi Zalo là số trong nước (`0912 345 678`).
 */

/**
 * Đầu số di động 11 số cũ → đầu số 10 số mới (chuyển đổi từ 15/09/2018). Khoá là đầu số cũ bỏ số 0 (`162`),
 * giá trị là đầu số mới bỏ số 0 (`32`).
 */
const OLD_MOBILE_PREFIXES: Readonly<Record<string, string>> = {
  // Viettel
  '162': '32',
  '163': '33',
  '164': '34',
  '165': '35',
  '166': '36',
  '167': '37',
  '168': '38',
  '169': '39',
  // MobiFone
  '120': '70',
  '121': '79',
  '122': '77',
  '126': '76',
  '128': '78',
  // VinaPhone
  '123': '83',
  '124': '84',
  '125': '85',
  '127': '81',
  '129': '82',
  // Vietnamobile
  '186': '56',
  '188': '58',
  // Gmobile
  '199': '59',
};

/** Di động Việt Nam: +84 + 9 số, đầu 3 / 5 / 7 / 8 / 9 */
const VN_MOBILE = /^\+84[35789]\d{8}$/;
/** Cố định Việt Nam: +84 2xx + tổng 10 số sau +84 */
const VN_LANDLINE = /^\+842\d{9}$/;
/** Số nước ngoài E.164: 8–15 chữ số, không bắt đầu bằng 0 */
const FOREIGN = /^\+(?!84)[1-9]\d{7,14}$/;

/**
 * Chuẩn hoá về E.164: bỏ ký tự phân cách; `0912…` / `84912…` / `0084912…` / `912…` (quên số 0) → `+84912…`;
 * `+84 0912…` (thừa số 0) → `+84912…`; đầu số 11 số cũ (`0166…`) → đầu số mới (`036…`). Số nước ngoài giữ chữ số.
 * Trả `null` khi không có chữ số nào. Kết quả chưa chắc hợp lệ — kiểm bằng `isValidPhone`.
 */
export function normalizePhone(input: string): string | null {
  let s = input.replace(/[^0-9+]/g, '');
  if (!/\d/.test(s)) return null;
  if (s.startsWith('+')) s = `+${s.replace(/\+/g, '')}`;
  else if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (s.startsWith('84') && s.length >= 11) s = `+${s}`;
  else if (s.startsWith('0')) s = `+84${s.slice(1)}`;
  else if (/^[35789]\d{8}$/.test(s)) s = `+84${s}`;
  else return s;

  if (s.startsWith('+840')) s = `+84${s.slice(4)}`;
  const old = /^\+84(1\d{2})(\d{7})$/.exec(s);
  const prefix = old && OLD_MOBILE_PREFIXES[old[1]!];
  if (old && prefix) s = `+84${prefix}${old[2]}`;
  return s;
}

/** Số (đã hoặc chưa chuẩn hoá) là di động / cố định Việt Nam hoặc số quốc tế hợp lệ */
export function isValidPhone(input: string): boolean {
  const e164 = normalizePhone(input);
  return !!e164 && (VN_MOBILE.test(e164) || VN_LANDLINE.test(e164) || FOREIGN.test(e164));
}

/** Di động Việt Nam (dùng được Zalo) */
export function isVnMobile(input: string): boolean {
  const e164 = normalizePhone(input);
  return !!e164 && VN_MOBILE.test(e164);
}

/** Số trong nước không khoảng trắng: `+84912345678` → `0912345678`; số nước ngoài giữ `+…` */
export function localPhone(input: string | null | undefined): string {
  if (!input) return '';
  const e164 = normalizePhone(input);
  if (!e164) return '';
  return e164.startsWith('+84') ? `0${e164.slice(3)}` : e164;
}

/** Hiển thị: di động `0912 345 678`, cố định `024 3826 1234`, khác giữ nguyên dạng chuẩn hoá */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return '';
  const e164 = normalizePhone(input);
  if (!e164) return input.trim();
  const local = localPhone(e164);
  if (VN_MOBILE.test(e164)) return local.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
  if (VN_LANDLINE.test(e164)) return local.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1 $2 $3');
  return e164;
}

/** Link mở khung chat Zalo (điện thoại / Zalo PC) với số di động Việt Nam; số khác → null */
export function zaloChatUrl(input: string | null | undefined): string | null {
  if (!input || !isVnMobile(input)) return null;
  return `https://zalo.me/${localPhone(input)}`;
}
