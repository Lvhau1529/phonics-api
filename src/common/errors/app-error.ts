import { HttpException, type HttpStatus } from '@nestjs/common';
import { type ErrorCode } from '@phonics/contracts';
import { DEFAULT_LOCALE, type Locale } from '@/common/i18n/locale';
import { type MessageRef, translate } from '@/common/i18n/translate';

export interface AppErrorOptions {
  /** Message thay cho message mặc định của `code` (khoá trong `common/i18n/messages.*.ts`) */
  message?: MessageRef;
  /** Lỗi theo field cần dịch: `{ name: ['classNameTaken'] }` */
  fieldErrors?: Record<string, MessageRef[]>;
  /** Dữ liệu thô theo field, không dịch (id, mã quyền, giới hạn số): `{ questionIds: [...] }` */
  details?: Record<string, string[]>;
}

/**
 * Lỗi nghiệp vụ có mã ổn định (contracts ErrorCode). AllExceptionsFilter chuyển thành envelope chuẩn, message /
 * `fieldErrors` dịch theo `Accept-Language` (ADR 0025) — nơi ném lỗi không viết chuỗi, chỉ đưa khoá:
 *   throw new AppError('EMAIL_TAKEN', 409, { fieldErrors: { email: ['EMAIL_TAKEN'] } })
 *   throw new AppError('CONFLICT', 409, { message: 'classNameTaken' })
 *   throw new AppError('VALIDATION_ERROR', 400, { fieldErrors: { teacherIds: [['notTeacherId', { id }]] } })
 * `message` / `details` của chính object là bản tiếng Việt (log, unit test).
 */
export class AppError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: Record<string, string[]>;
  private readonly messageRef: MessageRef;
  private readonly fieldErrors?: Record<string, MessageRef[]>;
  private readonly rawDetails?: Record<string, string[]>;

  constructor(code: ErrorCode, status: HttpStatus | number, options: AppErrorOptions = {}) {
    const messageRef = options.message ?? code;
    super(translate(DEFAULT_LOCALE, messageRef), status);
    this.code = code;
    this.messageRef = messageRef;
    this.fieldErrors = options.fieldErrors;
    this.rawDetails = options.details;
    this.details = this.detailsIn(DEFAULT_LOCALE);
  }

  /** Message + details theo ngôn ngữ của request */
  localize(locale: Locale): { message: string; details?: Record<string, string[]> } {
    return { message: translate(locale, this.messageRef), details: this.detailsIn(locale) };
  }

  private detailsIn(locale: Locale): Record<string, string[]> | undefined {
    if (!this.fieldErrors) return this.rawDetails;
    const translated = Object.fromEntries(
      Object.entries(this.fieldErrors).map(([field, refs]) => [
        field,
        refs.map((ref) => translate(locale, ref)),
      ]),
    );
    return { ...this.rawDetails, ...translated };
  }
}

export const notFound = (what: MessageRef = 'NOT_FOUND') => new AppError('NOT_FOUND', 404, { message: what });
