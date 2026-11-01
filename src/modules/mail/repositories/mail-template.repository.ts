import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type MailTemplate } from '@/generated/prisma/client';
import { type MailTemplateSource } from '@/infrastructure/mail/mail-renderer';

/** Mọi truy vấn của `mail_templates` */
@Injectable()
export class MailTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(key: string): Promise<MailTemplate | null> {
    return this.prisma.mailTemplate.findFirst({ where: { key, isActive: true } });
  }

  /** Khoá đã có ít nhất một phiên bản */
  async keysWithVersions(keys: readonly string[]): Promise<Set<string>> {
    const rows = await this.prisma.mailTemplate.findMany({
      where: { key: { in: [...keys] } },
      distinct: ['key'],
      select: { key: true },
    });
    return new Set(rows.map((r) => r.key));
  }

  /**
   * Tạo phiên bản 1 (active) cho các khoá chưa có. Nhiều tiến trình cùng khởi động: trùng `(key, version)` bị bỏ qua.
   */
  async insertDefaults(defaults: { key: string; source: MailTemplateSource }[]): Promise<number> {
    if (!defaults.length) return 0;
    const { count } = await this.prisma.mailTemplate.createMany({
      data: defaults.map(({ key, source }) => ({
        key,
        version: 1,
        subject: source.subject,
        bodyHtml: source.bodyHtml,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    return count;
  }
}
