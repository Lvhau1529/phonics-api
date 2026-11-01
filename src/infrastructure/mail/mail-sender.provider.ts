import { Logger, type Provider } from '@nestjs/common';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { LogMailSender } from '@/infrastructure/mail/log-mail-sender';
import { MailSender } from '@/infrastructure/mail/mail-sender';
import { SmtpMailSender } from '@/infrastructure/mail/smtp-mail-sender';

/** `MailSender` theo `MAIL_DRIVER` (log | smtp) */
export const mailSenderProvider: Provider = {
  provide: MailSender,
  inject: [ENV],
  useFactory: (env: Env): MailSender => {
    if (env.MAIL_DRIVER === 'smtp') return new SmtpMailSender(env);
    if (env.NODE_ENV === 'production') {
      new Logger('MailSender').warn(
        `MAIL_DRIVER=log: mail chỉ được ghi vào ${env.MAIL_LOG_DIR}, không gửi thật`,
      );
    }
    return new LogMailSender(env);
  },
};
