import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { MailTemplateError } from '@/infrastructure/mail/mail-renderer';
import { type MailOutboxScheduler } from '@/modules/mail/jobs/mail-outbox.scheduler';
import { MailOutboxRepository } from '@/modules/mail/repositories/mail-outbox.repository';
import { MailOutboxService } from '@/modules/mail/services/mail-outbox.service';
import { type MailTemplateService } from '@/modules/mail/services/mail-template.service';

const base = { kind: 'system.test', subject: 's', html: '<p>h</p>', text: 'h' };

function setup() {
  const prisma = mockDeep<PrismaService>();
  const templates = mockDeep<MailTemplateService>();
  const scheduler = mockDeep<MailOutboxScheduler>();
  prisma.mailOutbox.createMany.mockResolvedValue({ count: 1 });
  // Repository thật bọc Prisma mock: assert trên lời gọi Prisma
  const service = new MailOutboxService(new MailOutboxRepository(prisma), templates, scheduler);
  return { prisma, templates, scheduler, service };
}

describe('MailOutboxService', () => {
  it('xếp hàng QUEUED, bỏ trùng dedupe_key ở DB, cc bỏ trùng / rỗng / trùng người nhận', async () => {
    const { prisma, service } = setup();
    const sendAt = new Date('2026-11-02T01:00:00.000Z');
    await service.enqueue([
      {
        ...base,
        to: ' a@test.vn ',
        cc: ['b@test.vn', 'b@test.vn', ' ', 'a@test.vn'],
        dedupeKey: 'k1',
        sendAt,
      },
    ]);
    expect(prisma.mailOutbox.createMany).toHaveBeenCalledWith({
      data: [
        {
          ...{ kind: 'system.test', subject: 's', html: '<p>h</p>', text: 'h' },
          toEmail: 'a@test.vn',
          cc: ['b@test.vn'],
          dedupeKey: 'k1',
          refType: undefined,
          refId: undefined,
          status: 'QUEUED',
          nextAttemptAt: sendAt,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('không có người nhận → lưu SKIPPED (để màn quản trị thấy), không gửi', async () => {
    const { prisma, service } = setup();
    await service.enqueue([
      { ...base, to: null, dedupeKey: 'k1' },
      { ...base, to: '  ', dedupeKey: 'k2' },
    ]);
    const { data } = prisma.mailOutbox.createMany.mock.calls[0][0] as {
      data: { status: string; toEmail: unknown }[];
    };
    expect(data.map((d) => [d.status, d.toEmail])).toEqual([
      ['SKIPPED', null],
      ['SKIPPED', null],
    ]);
  });

  it('ghi bằng transaction của caller khi có; danh sách rỗng không gọi DB', async () => {
    const { prisma, service } = setup();
    const tx = mockDeep<Tx>();
    tx.mailOutbox.createMany.mockResolvedValue({ count: 1 });
    expect(await service.enqueue([{ ...base, to: 'a@test.vn', dedupeKey: 'k' }], tx)).toBe(1);
    expect(tx.mailOutbox.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.mailOutbox.createMany).not.toHaveBeenCalled();
    expect(await service.enqueue([])).toBe(0);
    expect(prisma.mailOutbox.createMany).not.toHaveBeenCalled();
  });

  it('enqueueTemplate render bằng mẫu active, kind = khoá mẫu', async () => {
    const { prisma, templates, service } = setup();
    templates.render.mockResolvedValue({
      subject: 'Mail thử',
      html: '<p>x</p>',
      text: 'x',
      template: { id: 't1', version: 2 },
    });
    await service.enqueueTemplate([
      {
        key: 'system.test',
        context: { sentAtText: 'now' },
        to: 'a@test.vn',
        dedupeKey: 'k',
        refType: 'x',
        refId: '1',
      },
    ]);
    expect(templates.render).toHaveBeenCalledWith('system.test', { sentAtText: 'now' });
    const { data } = prisma.mailOutbox.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
    expect(data[0]).toMatchObject({
      kind: 'system.test',
      subject: 'Mail thử',
      html: '<p>x</p>',
      text: 'x',
      refId: '1',
    });
  });

  it('mẫu lỗi → ném lỗi, không ghi gì (transaction của caller rollback)', async () => {
    const { prisma, templates, service } = setup();
    templates.render.mockRejectedValue(new MailTemplateError('undefined variable: x'));
    await expect(
      service.enqueueTemplate([{ key: 'system.test', context: {}, to: 'a@test.vn', dedupeKey: 'k' }]),
    ).rejects.toBeInstanceOf(MailTemplateError);
    expect(prisma.mailOutbox.createMany).not.toHaveBeenCalled();
  });

  it('flush báo scheduler tính lại mốc', () => {
    const { scheduler, service } = setup();
    scheduler.reschedule.mockResolvedValue();
    service.flush();
    expect(scheduler.reschedule).toHaveBeenCalledTimes(1);
  });
});
