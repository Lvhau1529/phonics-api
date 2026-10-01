import { randomUUID } from 'node:crypto';
import { type NextFunction, type Request, type Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Gắn mã request cho mọi request: giữ `X-Request-Id` client gửi lên (gateway / proxy) hoặc sinh UUID mới,
 * ghi lại vào header request (pino `genReqId`, `AllExceptionsFilter` đọc) và trả về ở response header
 * (CORS đã expose) để đối chiếu log khi người dùng báo lỗi.
 *
 * Đăng ký bằng `app.use()` trong `configureApp` → chạy trước mọi middleware của module (kể cả pino-http).
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() || randomUUID();
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader('X-Request-Id', id);
  next();
}
