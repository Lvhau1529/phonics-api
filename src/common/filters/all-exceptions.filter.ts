import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiErrorBody, type ErrorCode } from '@phonics/contracts';
import { type Request, type Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { type ZodError } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../errors/app-error';

/** Gom issue của zod theo field: { "email": ["Invalid email"] } */
export function flattenZodError(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Mọi lỗi ra ngoài đều có cùng envelope (contracts ApiErrorBody) để client map theo `code`.
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

    const body = this.toBody(exception);
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

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof ZodValidationException) {
      return {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        details: flattenZodError(exception.getZodError() as ZodError),
      };
    }
    if (exception instanceof AppError) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002')
        return { statusCode: 409, code: 'CONFLICT', message: 'Dữ liệu bị trùng' };
      if (exception.code === 'P2025')
        return { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy' };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_CODE[status] ?? 'INTERNAL';
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message?.toString() ?? exception.message);
      return { statusCode: status, code, message };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
      message: this.isProduction
        ? 'Lỗi hệ thống'
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
