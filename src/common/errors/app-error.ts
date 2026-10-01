import { HttpException, type HttpStatus } from '@nestjs/common';
import { type ErrorCode } from '@phonics/contracts';

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ',
  UNAUTHORIZED: 'Cần đăng nhập',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn',
  INVALID_REFRESH: 'Refresh token không hợp lệ',
  REFRESH_REUSED: 'Refresh token đã bị dùng lại, vui lòng đăng nhập lại',
  FORBIDDEN: 'Không có quyền truy cập',
  FORBIDDEN_PERMISSION: 'Thiếu quyền thực hiện thao tác này',
  FORBIDDEN_SCOPE: 'Không thuộc phạm vi lớp của bạn',
  ACCOUNT_DISABLED: 'Tài khoản đã bị khoá',
  INVALID_CREDENTIALS: 'Sai email hoặc mật khẩu',
  EMAIL_TAKEN: 'Email đã được sử dụng',
  PROFILE_REQUIRED: 'Cần chọn lớp và tên hiển thị để tạo tài khoản',
  GOOGLE_EMAIL_UNVERIFIED: 'Email Google chưa được xác thực',
  GOOGLE_TOKEN_INVALID: 'Token Google không hợp lệ',
  CLASS_NOT_JOINABLE: 'Lớp này không nhận học sinh mới',
  NOT_FOUND: 'Không tìm thấy',
  CONFLICT: 'Dữ liệu bị trùng',
  UNKNOWN_GAME: 'Game không tồn tại',
  RESULT_IMPLAUSIBLE: 'Kết quả không hợp lệ',
  PLAYED_AT_OUT_OF_RANGE: 'Thời điểm chơi không hợp lệ',
  DETAILS_TOO_LARGE: 'Chi tiết ván chơi quá lớn',
  RATE_LIMITED: 'Thao tác quá nhanh, thử lại sau',
  INTERNAL: 'Lỗi hệ thống',
};

/**
 * Lỗi nghiệp vụ có mã ổn định (contracts ErrorCode). AllExceptionsFilter chuyển thành envelope chuẩn.
 *   throw new AppError('EMAIL_TAKEN', 409)
 *   throw new AppError('VALIDATION_ERROR', 400, { details: { email: ['Email đã dùng'] } })
 */
export class AppError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ErrorCode,
    status: HttpStatus | number,
    options: { message?: string; details?: Record<string, string[]> } = {},
  ) {
    super(options.message ?? DEFAULT_MESSAGE[code], status);
    this.code = code;
    this.details = options.details;
  }
}

export const notFound = (what = 'Không tìm thấy') => new AppError('NOT_FOUND', 404, { message: what });
