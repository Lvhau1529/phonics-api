import { Injectable } from '@nestjs/common';
import { type PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { MailOutboxScheduler } from '@/modules/mail/jobs/mail-outbox.scheduler';
import { MailOutboxRepository } from '@/modules/mail/repositories/mail-outbox.repository';
import { MailTemplateService } from '@/modules/mail/services/mail-template.service';
import { type MailTemplateKey } from '@/modules/mail/templates/mail-templates';
import { type OutboxItem } from '@/modules/mail/types/mail.types';

/** Mail theo mẫu: render bằng mẫu đang active lúc xếp hàng */
export interface TemplatedOutboxItem extends Omit<OutboxItem, 'kind' | 'subject' | 'html' | 'text'> {
  key: MailTemplateKey;
  context: Record<string, unknown>;
}

/**
 * Cửa vào duy nhất để gửi mail cho module khác. Cách dùng:
 *
 * ```ts
 * await this.repo.transaction(async (tx) => {
 *   // …thay đổi nghiệp vụ…
 *   await this.mail.enqueueTemplate([{ key, context, to, dedupeKey }], tx);
 * });
 * this.mail.flush(); // sau commit: báo worker có mail mới
 * ```
 *
 * Xếp hàng trong transaction nghiệp vụ → rollback thì không có mail; commit rồi mới gửi.
 */
@Injectable()
export class MailOutboxService {
  constructor(
    private readonly repo: MailOutboxRepository,
    private readonly templates: MailTemplateService,
    private readonly scheduler: MailOutboxScheduler,
  ) {}

  /** Xếp hàng mail đã render sẵn (trong `db` = transaction của caller nếu có). Trả số mail mới (trùng `dedupeKey` không tính). */
  enqueue(items: readonly OutboxItem[], db?: Tx | PrismaService): Promise<number> {
    return this.repo.insertMany(
      items.map((item) => {
        const to = item.to?.trim() || null;
        return {
          kind: item.kind,
          toEmail: to,
          cc: [...new Set((item.cc ?? []).map((c) => c.trim()).filter((c) => c && c !== to))],
          subject: item.subject,
          html: item.html,
          text: item.text,
          dedupeKey: item.dedupeKey,
          refType: item.refType,
          refId: item.refId,
          status: to ? 'QUEUED' : 'SKIPPED',
          nextAttemptAt: item.sendAt,
        };
      }),
      db,
    );
  }

  /** Render theo mẫu đang active rồi xếp hàng; mẫu lỗi → `MailTemplateError` (transaction của caller rollback) */
  async enqueueTemplate(items: readonly TemplatedOutboxItem[], db?: Tx | PrismaService): Promise<number> {
    const rendered: OutboxItem[] = [];
    for (const { key, context, ...rest } of items) {
      const { subject, html, text } = await this.templates.render(key, context);
      rendered.push({ ...rest, kind: key, subject, html, text });
    }
    return this.enqueue(rendered, db);
  }

  /** Gọi sau khi transaction chứa `enqueue` đã commit: tính lại mốc gửi */
  flush(): void {
    void this.scheduler.reschedule();
  }
}
