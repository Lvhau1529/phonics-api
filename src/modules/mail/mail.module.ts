import { Module } from '@nestjs/common';
import { MailRenderer } from '@/infrastructure/mail/mail-renderer';
import { mailSenderProvider } from '@/infrastructure/mail/mail-sender.provider';
import { MailOutboxScheduler } from '@/modules/mail/jobs/mail-outbox.scheduler';
import { MailOutboxRepository } from '@/modules/mail/repositories/mail-outbox.repository';
import { MailTemplateRepository } from '@/modules/mail/repositories/mail-template.repository';
import { MailDeliveryService } from '@/modules/mail/services/mail-delivery.service';
import { MailOutboxService } from '@/modules/mail/services/mail-outbox.service';
import { MailTemplateService } from '@/modules/mail/services/mail-template.service';

/**
 * Gửi mail: outbox (xếp hàng trong transaction nghiệp vụ, gửi sau commit, retry + backoff, chống trùng) + mẫu mail
 * Liquid có phiên bản. Module khác `imports: [MailModule]` rồi dùng `MailOutboxService`.
 */
@Module({
  providers: [
    mailSenderProvider,
    MailRenderer,
    MailOutboxRepository,
    MailTemplateRepository,
    MailTemplateService,
    MailDeliveryService,
    MailOutboxScheduler,
    MailOutboxService,
  ],
  exports: [MailOutboxService, MailTemplateService],
})
export class MailModule {}
