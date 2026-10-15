import { type ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { UpdateClassBody } from '@phonics/contracts';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { AppError, notFound } from '@/common/errors/app-error';
import { AllExceptionsFilter, flattenZodError } from '@/common/filters/all-exceptions.filter';
import { runWithLocale } from '@/common/i18n/locale';

/** Gọi filter với một request giả, trả về { status, body } đã gửi */
function run(exception: unknown, acceptLanguage?: string, isProduction = false) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const req = { headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {}, originalUrl: '/x' };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter(isProduction).catch(exception, host);
  return { status: res.status.mock.calls[0]?.[0] as number, body: res.json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter — message theo Accept-Language', () => {
  it('AppError: message riêng + fieldErrors dịch, details thô giữ nguyên', () => {
    const error = new AppError('VALIDATION_ERROR', 400, {
      message: 'notTeacherIds',
      fieldErrors: { teacherIds: [['notTeacherId', { id: 'u1' }]] },
      details: { questionIds: ['q1'] },
    });
    expect(run(error, 'en').body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Some ids are not teachers',
      details: { teacherIds: ['u1 is not a teacher'], questionIds: ['q1'] },
    });
    expect(run(error, 'vi-VN').body).toMatchObject({
      message: 'Có id không phải giáo viên',
      details: { teacherIds: ['u1 không phải giáo viên'], questionIds: ['q1'] },
    });
  });

  it('không có header → tiếng Việt; message / details của object là tiếng Việt', () => {
    const error = notFound('classNotFound');
    expect(error.message).toBe('Không tìm thấy lớp');
    expect(run(error).body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Không tìm thấy lớp',
    });
    expect(run(error, 'en').body.message).toBe('Class not found');
  });

  it('HttpException có mã đã biết → message chuẩn theo locale', () => {
    expect(run(new NotFoundException('Cannot GET /x'), 'en').body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Not found',
    });
  });

  it('lỗi lạ ở production → INTERNAL theo locale, không lộ message', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { status, body } = run(new Error('db password leaked'), 'en', true);
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: 'INTERNAL', message: 'System error' });
  });
});

describe('Lỗi validate zod — khoá message của contracts', () => {
  const zodError = () => {
    const r = UpdateClassBody.safeParse({});
    if (r.success) throw new Error('phải lỗi');
    return r.error;
  };

  it('ZodValidationException: khoá dịch theo Accept-Language', () => {
    const exception = new ZodValidationException(zodError());
    expect(run(exception, 'en').body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid data',
      details: { _: ['At least one field is required'] },
    });
    expect(run(exception).body.details).toEqual({ _: ['Cần ít nhất một trường'] });
  });

  it('flattenZodError ngoài filter dùng locale của request hiện tại', () => {
    expect(runWithLocale('en', () => flattenZodError(zodError()))).toEqual({
      _: ['At least one field is required'],
    });
    expect(flattenZodError(zodError())).toEqual({ _: ['Cần ít nhất một trường'] });
  });
});
