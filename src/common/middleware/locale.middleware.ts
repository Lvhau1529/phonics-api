import { type NextFunction, type Request, type Response } from 'express';
import { resolveLocale, runWithLocale } from '@/common/i18n/locale';

/**
 * Ngôn ngữ message lỗi theo `Accept-Language` (vi | en, mặc định vi — ADR 0025): chạy phần còn lại của request
 * trong ngữ cảnh locale (zod sinh message đúng ngôn ngữ lúc validate), báo `Content-Language` và
 * `Vary: Accept-Language` cho cache.
 */
export function localeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const locale = resolveLocale(req.headers['accept-language']);
  res.setHeader('Content-Language', locale);
  res.vary('Accept-Language');
  runWithLocale(locale, next);
}
