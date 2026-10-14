import { z } from 'zod';

/** Mã lỗi ổn định để client dịch sang thông báo (admin: i18n/vi.ts; game: tiếng Anh cho bé) */
export const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'INVALID_REFRESH',
  'REFRESH_REUSED',
  'FORBIDDEN',
  'FORBIDDEN_PERMISSION',
  'FORBIDDEN_SCOPE',
  'ACCOUNT_DISABLED',
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  'PROFILE_REQUIRED',
  'GOOGLE_EMAIL_UNVERIFIED',
  'GOOGLE_TOKEN_INVALID',
  'CLASS_NOT_JOINABLE',
  'NOT_FOUND',
  'CONFLICT',
  'UNKNOWN_GAME',
  'RESULT_IMPLAUSIBLE',
  'PLAYED_AT_OUT_OF_RANGE',
  'DETAILS_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
  // Media (ảnh / audio)
  'MEDIA_TYPE_UNSUPPORTED',
  'MEDIA_TOO_LARGE',
  'MEDIA_NOT_READY',
  'MEDIA_UPLOAD_INCOMPLETE',
  'MEDIA_STORAGE_DISABLED',
  // Phiếu bài tập
  'QUESTION_NOT_PUBLISHED',
  'WORKSHEET_NOT_PUBLISHED',
  'WORKSHEET_EMPTY',
  'WORKSHEET_IN_USE',
  'ASSIGNMENT_NOT_OPEN',
  'ATTEMPTS_EXHAUSTED',
  'SUBMISSION_NOT_EDITABLE',
  'SUBMISSION_NOT_SUBMITTED',
  'GRADING_INCOMPLETE',
  'ANSWER_TYPE_MISMATCH',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Envelope lỗi thống nhất của API (AllExceptionsFilter) */
export const ApiErrorBody = z.object({
  statusCode: z.int(),
  code: ErrorCode,
  message: z.string(),
  /** Lỗi validate theo field: { "email": ["Invalid email"] } */
  details: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string().optional(),
  path: z.string().optional(),
  timestamp: z.string().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
