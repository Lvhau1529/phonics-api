import { Injectable, Logger } from '@nestjs/common';
import { MAIL } from '@/config/constants';
import { MailSender, PermanentMailError } from '@/infrastructure/mail/mail-sender';
import { MailOutboxRepository } from '@/modules/mail/repositories/mail-outbox.repository';
import { type DeliveryResult } from '@/modules/mail/types/mail.types';
import { errorText, nextRetryAt } from '@/modules/mail/utils/retry';

/** Gửi một lô mail đến hạn trong outbox; chỉ `MailOutboxScheduler` gọi */
@Injectable()
export class MailDeliveryService {
  private readonly logger = new Logger(MailDeliveryService.name);

  constructor(
    private readonly repo: MailOutboxRepository,
    private readonly sender: MailSender,
  ) {}

  nextDueAt(): Promise<Date | null> {
    return this.repo.nextDueAt();
  }

  /** Lỗi của từng mail được ghi vào dòng đó (retry / FAILED); chỉ lỗi DB mới ném ra ngoài */
  async deliverDue(now = new Date()): Promise<DeliveryResult> {
    const batch = await this.repo.claimDue(now, new Date(now.getTime() + MAIL.leaseMs), MAIL.batchSize);
    const result: DeliveryResult = { sent: 0, retried: 0, failed: 0 };
    for (const mail of batch) {
      try {
        await this.sender.send({
          to: mail.toEmail,
          cc: mail.cc,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        await this.repo.markSent(mail.id, new Date());
        result.sent += 1;
      } catch (err) {
        const error = errorText(err);
        const retryAt = err instanceof PermanentMailError ? null : nextRetryAt(mail.attempts, new Date());
        if (retryAt) {
          await this.repo.markRetry(mail.id, retryAt, error);
          result.retried += 1;
        } else {
          await this.repo.markFailed(mail.id, error);
          result.failed += 1;
        }
        this.logger.warn(`Gửi mail ${mail.id} lỗi (lần ${mail.attempts}${retryAt ? '' : ', bỏ'}): ${error}`);
      }
    }
    if (batch.length) {
      this.logger.log(`Mail: gửi ${result.sent}, thử lại ${result.retried}, lỗi ${result.failed}`);
    }
    return result;
  }
}
