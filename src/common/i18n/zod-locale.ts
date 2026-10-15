import { z } from 'zod';
import { currentLocale, type Locale } from '@/common/i18n/locale';

const ZOD_LOCALES: Record<Locale, ReturnType<typeof z.locales.vi>> = {
  vi: z.locales.vi(),
  en: z.locales.en(),
};

/**
 * Message mặc định của zod (min / max / type...) theo ngôn ngữ của request hiện tại (`localeMiddleware`).
 * Message tự viết trong schema contracts vẫn ưu tiên hơn (zod chỉ gọi `localeError` khi schema không có message).
 * Gọi một lần lúc dựng app (`configureApp`).
 */
export function configureZodLocale(): void {
  z.config({ localeError: (issue) => ZOD_LOCALES[currentLocale()].localeError(issue) });
}
