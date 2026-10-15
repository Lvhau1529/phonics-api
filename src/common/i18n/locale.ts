import { AsyncLocalStorage } from 'node:async_hooks';

/** Ngôn ngữ của message lỗi trả về client (ADR 0025) */
export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Không có / không khớp `Accept-Language` → tiếng Việt (giữ hành vi cũ) */
export const DEFAULT_LOCALE: Locale = 'vi';

/**
 * `Accept-Language` → Locale: duyệt theo trọng số `q` (giảm dần), lấy ngôn ngữ chính đầu tiên có hỗ trợ.
 * `en-US,en;q=0.9,vi;q=0.8` → en; `vi-VN` → vi; `fr` / thiếu header → DEFAULT_LOCALE.
 */
export function resolveLocale(header: string | string[] | undefined): Locale {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return DEFAULT_LOCALE;
  const ranked = raw
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) || 0 : 1, index };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return (
    (ranked.find((x) => (LOCALES as readonly string[]).includes(x.lang))?.lang as Locale) ?? DEFAULT_LOCALE
  );
}

/** Ngữ cảnh theo request (gắn ở `localeMiddleware`) — để zod sinh message đúng ngôn ngữ ngay lúc validate */
const requestContext = new AsyncLocalStorage<{ locale: Locale }>();

export const runWithLocale = <T>(locale: Locale, fn: () => T): T => requestContext.run({ locale }, fn);

/** Ngôn ngữ của request hiện tại; ngoài request (job, script, unit test) → DEFAULT_LOCALE */
export const currentLocale = (): Locale => requestContext.getStore()?.locale ?? DEFAULT_LOCALE;
