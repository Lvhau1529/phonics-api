import { createTransport, type Transporter } from 'nodemailer';
import { type Env } from '@/config/env.schema';
import { type MailMessage, MailSender, PermanentMailError } from '@/infrastructure/mail/mail-sender';

type SmtpEnv = Pick<Env, 'MAIL_FROM' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS'>;

interface SmtpError {
  code?: string;
  responseCode?: number;
}

/**
 * Lỗi do chính mail này (địa chỉ không tồn tại / bị từ chối), không phải do kết nối hay cấu hình: gửi lại y nguyên
 * cũng hỏng. Lỗi đăng nhập SMTP (EAUTH) coi là tạm thời — sửa cấu hình xong thì hàng đợi tự gửi tiếp.
 */
export function isPermanentSmtpError(err: unknown): boolean {
  const { code, responseCode } = (err ?? {}) as SmtpError;
  if (code === 'EAUTH' || code === 'ENOAUTH') return false;
  return code === 'EENVELOPE' || (responseCode !== undefined && responseCode >= 550 && responseCode <= 554);
}

/** Gửi qua máy chủ SMTP (nodemailer, giữ một kết nối pool cho cả lô) */
export class SmtpMailSender extends MailSender {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(env: SmtpEnv) {
    super();
    this.from = env.MAIL_FROM;
    this.transport = createTransport({
      pool: true,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        cc: message.cc?.length ? [...message.cc] : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (err) {
      if (isPermanentSmtpError(err)) throw new PermanentMailError(String(err));
      throw err;
    }
  }
}
