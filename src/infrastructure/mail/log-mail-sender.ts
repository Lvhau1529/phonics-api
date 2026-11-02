import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { type Env } from '@/config/env.schema';
import { type MailMessage, MailSender } from '@/infrastructure/mail/mail-sender';

/**
 * Không gửi thật: dựng mail MIME đầy đủ (nodemailer stream transport) rồi ghi `<MAIL_LOG_DIR>/<thời gian>-<id>.eml` —
 * mở bằng Outlook / Thunderbird / trình duyệt để xem đúng như người nhận thấy. Dùng cho dev / test.
 */
export class LogMailSender extends MailSender {
  private readonly logger = new Logger(LogMailSender.name);
  private readonly transport: Transporter;
  readonly dir: string;

  constructor(private readonly env: Pick<Env, 'MAIL_FROM' | 'MAIL_LOG_DIR'>) {
    super();
    this.dir = resolve(env.MAIL_LOG_DIR);
    this.transport = createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }

  async send(message: MailMessage): Promise<void> {
    const info = (await this.transport.sendMail({
      from: this.env.MAIL_FROM,
      to: message.to,
      cc: message.cc?.length ? [...message.cc] : undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })) as { message: Buffer };
    await mkdir(this.dir, { recursive: true });
    const file = join(
      this.dir,
      `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.eml`,
    );
    await writeFile(file, info.message);
    this.logger.log(`[MAIL_DRIVER=log] "${message.subject}" → ${message.to} (${file})`);
  }
}
