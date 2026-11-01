import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  MailRenderer,
  type MailTemplateSource,
  type RenderedMail,
} from '@/infrastructure/mail/mail-renderer';
import { MailTemplateRepository } from '@/modules/mail/repositories/mail-template.repository';
import {
  MAIL_TEMPLATE_KEYS,
  MAIL_TEMPLATES,
  type MailTemplateKey,
  mailLayout,
} from '@/modules/mail/templates/mail-templates';

/** Mẫu đang dùng của một khoá; `version` 0 = mẫu mặc định trong code (DB chưa có) */
export interface ActiveTemplate extends MailTemplateSource {
  key: MailTemplateKey;
  id: string | null;
  version: number;
}

export interface RenderedTemplate extends RenderedMail {
  template: { id: string | null; version: number };
}

/** Lấy mẫu đang active và render thành mail (khung chung + chữ thuần) */
@Injectable()
export class MailTemplateService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MailTemplateService.name);

  constructor(
    private readonly repo: MailTemplateRepository,
    private readonly renderer: MailRenderer,
  ) {}

  /** Ghi mẫu mặc định cho khoá mới (chưa có phiên bản nào) — không ghi đè mẫu admin đã sửa */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const existing = await this.repo.keysWithVersions(MAIL_TEMPLATE_KEYS);
      const missing = MAIL_TEMPLATE_KEYS.filter((key) => !existing.has(key));
      const created = await this.repo.insertDefaults(
        missing.map((key) => ({ key, source: MAIL_TEMPLATES[key] })),
      );
      if (created) this.logger.log(`Đã tạo ${created} mẫu mail mặc định: ${missing.join(', ')}`);
    } catch (err) {
      // Không chặn khởi động: chưa có trong DB thì `active()` dùng mẫu trong code
      this.logger.error(`Không tạo được mẫu mail mặc định: ${String(err)}`);
    }
  }

  async active(key: MailTemplateKey): Promise<ActiveTemplate> {
    const row = await this.repo.findActive(key);
    if (row) return { key, id: row.id, version: row.version, subject: row.subject, bodyHtml: row.bodyHtml };
    const def = MAIL_TEMPLATES[key];
    return { key, id: null, version: 0, subject: def.subject, bodyHtml: def.bodyHtml };
  }

  /** Render mẫu đang active của `key`; mẫu lỗi → `MailTemplateError` */
  async render(key: MailTemplateKey, context: Record<string, unknown>): Promise<RenderedTemplate> {
    const template = await this.active(key);
    return {
      ...(await this.renderSource(template, context)),
      template: { id: template.id, version: template.version },
    };
  }

  /** Render một mẫu bất kỳ (xem trước bản đang sửa) */
  renderSource(source: MailTemplateSource, context: Record<string, unknown>): Promise<RenderedMail> {
    return this.renderer.render(source, context, mailLayout);
  }
}
