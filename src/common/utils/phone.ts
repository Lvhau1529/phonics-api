/**
 * Chuẩn hoá số điện thoại về E.164 trước khi lưu — logic dùng chung với admin / game nằm ở contracts
 * (`common/phone.ts`: đầu số cũ 11 số, `+84 0…`, `0084…`, quên số 0). Bản cũ của logic này cũng có trong
 * `pg_temp.norm_phone` của migration `family_accounts` (chỉ dùng một lần khi chuyển dữ liệu).
 */
export { normalizePhone } from '@phonics/contracts';
