/**
 * Gửi một mail thử để kiểm tra cấu hình gửi mail (MAIL_DRIVER / SMTP_* / MAIL_FROM trong .env):
 *   pnpm mail:test ban@example.com
 * Gửi thẳng qua MailSender (không qua outbox / DB) bằng mẫu mặc định `system.test`. MAIL_DRIVER=log thì chỉ ghi file
 * `.eml` vào MAIL_LOG_DIR.
 */
import 'dotenv/config';
import { validateEnv } from '@/config/env.schema';
import { dayjs } from '@/core/time/dayjs';
import { LogMailSender } from '@/infrastructure/mail/log-mail-sender';
import { MailRenderer } from '@/infrastructure/mail/mail-renderer';
import { SmtpMailSender } from '@/infrastructure/mail/smtp-mail-sender';
import { MAIL_TEMPLATES, mailLayout } from '@/modules/mail/templates/mail-templates';

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to || !to.includes('@')) throw new Error('Cách dùng: pnpm mail:test <email>');
  const env = validateEnv(process.env);
  const sender = env.MAIL_DRIVER === 'smtp' ? new SmtpMailSender(env) : new LogMailSender(env);
  const sentAtText = dayjs().tz(env.APP_TIMEZONE).format('DD/MM/YYYY HH:mm');
  const mail = await new MailRenderer().render(MAIL_TEMPLATES['system.test'], { sentAtText }, mailLayout);
  await sender.send({ to, ...mail });
  console.log(`[mail:test] MAIL_DRIVER=${env.MAIL_DRIVER}: đã gửi "${mail.subject}" → ${to}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('[mail:test] lỗi:', error);
  process.exit(1);
});
