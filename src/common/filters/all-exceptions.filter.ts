import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiErrorBody, type ErrorCode, translateIssueMessage } from '@phonics/contracts';
import { type Request, type Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { type ZodError } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { AppError } from '@/common/errors/app-error';
import { currentLocale, type Locale, resolveLocale } from '@/common/i18n/locale';
import { translate } from '@/common/i18n/translate';

/**
 * Gom issue của zod theo field: { "email": ["Invalid email"] }. Message tự viết trong contracts là khoá
 * (`ValidationMessage`) → dịch theo locale; message mặc định của zod đã theo locale lúc validate.
 */
export function flattenZodError(error: ZodError, locale: Locale = currentLocale()): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    (out[key] ??= []).push(translateIssueMessage(issue, locale));
  }
  return out;
}

/**
 * Mọi lỗi ra ngoài đều có cùng envelope (contracts ApiErrorBody). `message` / `details` theo `Accept-Language`
 * (vi | en — ADR 0025) để client hiện thẳng; `code` ổn định cho client cần xử lý / ghi đè riêng.
 * Lỗi lạ (500) không lộ message ở production, chỉ log kèm requestId.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    // Đọc thẳng header (lỗi có thể xảy ra trước localeMiddleware)
    const body = this.toBody(exception, resolveLocale(req.headers['accept-language']));
    body.requestId = req.id ?? (req.headers['x-request-id'] as string | undefined);
    body.path = req.originalUrl;
    body.timestamp = new Date().toISOString();

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${body.statusCode} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, locale: Locale): ApiErrorBody {
    if (exception instanceof ZodValidationException) {
      // Message mặc định của zod đã theo locale lúc validate (configureZodLocale); khoá contracts dịch ở đây
      return {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: translate(locale, 'VALIDATION_ERROR'),
        details: flattenZodError(exception.getZodError() as ZodError, locale),
      };
    }
    if (exception instanceof AppError) {
      return { statusCode: exception.getStatus(), code: exception.code, ...exception.localize(locale) };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002')
        return { statusCode: 409, code: 'CONFLICT', message: translate(locale, 'CONFLICT') };
      if (exception.code === 'P2025')
        return { statusCode: 404, code: 'NOT_FOUND', message: translate(locale, 'NOT_FOUND') };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_CODE[status];
      // Mã đã biết (401 / 403 / 404 / 429...) → message chuẩn theo locale; còn lại giữ message của Nest
      if (code) return { statusCode: status, code, message: translate(locale, code) };
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message?.toString() ?? exception.message);
      return { statusCode: status, code: 'INTERNAL', message };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
      message: this.isProduction
        ? translate(locale, 'INTERNAL')
        : exception instanceof Error
          ? exception.message
          : String(exception),
    };
  }
}

const STATUS_CODE: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};
