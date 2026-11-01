/** Một mail đã render xong, sẵn sàng gửi */
export interface MailMessage {
  to: string;
  cc?: readonly string[];
  subject: string;
  html: string;
  text: string;
}

/** Thử lại cũng vô ích (vd máy chủ từ chối địa chỉ người nhận) → outbox đánh FAILED ngay, không backoff */
export class PermanentMailError extends Error {}

/**
 * Nơi gửi mail, chọn theo `MAIL_DRIVER`: `log` (ghi file `.eml`, dev / test) hoặc `smtp`.
 * Chỉ gửi — hàng đợi, retry, chống trùng nằm ở `MailOutboxService`.
 */
export abstract class MailSender {
  /** Lỗi tạm thời ném Error thường (sẽ thử lại); lỗi vĩnh viễn ném `PermanentMailError` */
  abstract send(message: MailMessage): Promise<void>;
}
