/**
 * Dịch message lỗi theo ngôn ngữ (ADR 0025). Nơi ném lỗi chỉ đưa `MessageRef` (khoá, hoặc [khoá, tham số]), không
 * viết chuỗi — `AllExceptionsFilter` dịch theo `Accept-Language` của request.
 *   'classNotFound'                  → 'Không tìm thấy lớp' / 'Class not found'
 *   ['notTeacherId', { id }]         → `${id} không phải giáo viên` / `${id} is not a teacher`
 */
import { en } from '@/common/i18n/messages.en';
import { type Messages, vi } from '@/common/i18n/messages.vi';
import { type Locale } from '@/common/i18n/locale';

export type MessageKey = keyof Messages;

/** Khoá có tham số (message là hàm) */
type ParamKey = { [K in MessageKey]: Messages[K] extends (params: never) => string ? K : never }[MessageKey];
type PlainKey = Exclude<MessageKey, ParamKey>;

export type MessageRef =
  | PlainKey
  | {
      [K in ParamKey]: readonly [K, Parameters<Extract<Messages[K], (params: never) => string>>[0]];
    }[ParamKey];

const CATALOG: Record<Locale, Messages> = { vi, en };

export function translate(locale: Locale, ref: MessageRef): string {
  if (typeof ref === 'string') return CATALOG[locale][ref] as string;
  const [key, params] = ref;
  return (CATALOG[locale][key] as (p: typeof params) => string)(params);
}
