import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type PrismaService } from '@/database/prisma.service';
import { MailRenderer } from '@/infrastructure/mail/mail-renderer';
import { MailTemplateRepository } from '@/modules/mail/repositories/mail-template.repository';
import { MailTemplateService } from '@/modules/mail/services/mail-template.service';
import { MAIL_TEMPLATE_KEYS, MAIL_TEMPLATES, mailLayout } from '@/modules/mail/templates/mail-templates';

function setup() {
  const prisma = mockDeep<PrismaService>();
  // Repository thật bọc Prisma mock; renderer thật (hàm thuần)
  const service = new MailTemplateService(new MailTemplateRepository(prisma), new MailRenderer());
  return { prisma, service };
}

const row = {
  id: 't9',
  key: 'system.test',
  version: 3,
  subject: 'Sửa: {{ sentAtText }}',
  bodyHtml: '<p>Admin đã sửa {{ sentAtText }}</p>',
  isActive: true,
  createdById: 'a1',
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
};

describe('MailTemplateService', () => {
  it('mẫu mặc định của mọi khoá render được với dữ liệu mẫu (strict) và khai đủ biến', async () => {
    const { service } = setup();
    for (const key of MAIL_TEMPLATE_KEYS) {
      const def = MAIL_TEMPLATES[key];
      const out = await service.renderSource(def, def.sample);
      expect(out.subject.length).toBeGreaterThan(0);
      expect(Object.keys(def.variables).sort()).toEqual(Object.keys(def.sample).sort());
    }
  });

  it('render dùng phiên bản active trong DB, bọc khung chung', async () => {
    const { prisma, service } = setup();
    prisma.mailTemplate.findFirst.mockResolvedValue(row);
    const out = await service.render('system.test', { sentAtText: '01/11' });
    expect(prisma.mailTemplate.findFirst).toHaveBeenCalledWith({
      where: { key: 'system.test', isActive: true },
    });
    expect(out.subject).toBe('Sửa: 01/11');
    expect(out.html).toBe(mailLayout('<p>Admin đã sửa 01/11</p>'));
    expect(out.text).toContain('Admin đã sửa 01/11');
    expect(out.template).toEqual({ id: 't9', version: 3 });
  });

  it('DB chưa có mẫu → dùng mẫu mặc định trong code (version 0)', async () => {
    const { prisma, service } = setup();
    prisma.mailTemplate.findFirst.mockResolvedValue(null);
    const active = await service.active('system.test');
    expect(active).toMatchObject({ id: null, version: 0, subject: MAIL_TEMPLATES['system.test'].subject });
  });

  it('khởi động: chỉ tạo phiên bản 1 cho khoá chưa có, không đụng mẫu admin đã sửa', async () => {
    const { prisma, service } = setup();
    prisma.mailTemplate.findMany.mockResolvedValue([]);
    prisma.mailTemplate.createMany.mockResolvedValue({ count: MAIL_TEMPLATE_KEYS.length });
    await service.onApplicationBootstrap();
    expect(prisma.mailTemplate.createMany).toHaveBeenCalledWith({
      data: MAIL_TEMPLATE_KEYS.map((key) => ({
        key,
        version: 1,
        subject: MAIL_TEMPLATES[key].subject,
        bodyHtml: MAIL_TEMPLATES[key].bodyHtml,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    const again = setup();
    again.prisma.mailTemplate.findMany.mockResolvedValue(MAIL_TEMPLATE_KEYS.map((key) => ({ key }) as never));
    await again.service.onApplicationBootstrap();
    expect(again.prisma.mailTemplate.createMany).not.toHaveBeenCalled();
  });

  it('lỗi DB lúc khởi động không chặn app', async () => {
    const { prisma, service } = setup();
    prisma.mailTemplate.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
