import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { MAIL } from '@/config/constants';
import { type MailSender, PermanentMailError } from '@/infrastructure/mail/mail-sender';
import { type MailOutboxRepository } from '@/modules/mail/repositories/mail-outbox.repository';
import { MailDeliveryService } from '@/modules/mail/services/mail-delivery.service';
import { type ClaimedMail } from '@/modules/mail/types/mail.types';

const NOW = new Date('2026-11-01T14:00:00.000Z');

const mail = (id: string, attempts = 1): ClaimedMail => ({
  id,
  toEmail: `${id}@test.vn`,
  cc: [],
  subject: 's',
  html: '<p>h</p>',
  text: 'h',
  attempts,
});

function setup(batch: ClaimedMail[]) {
  const repo = mockDeep<MailOutboxRepository>();
  const sender = mockDeep<MailSender>();
  repo.claimDue.mockResolvedValue(batch);
  return { repo, sender, service: new MailDeliveryService(repo, sender) };
}

describe('MailDeliveryService.deliverDue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('lấy lô đến hạn với lease, gửi thành công → SENT', async () => {
    const { repo, sender, service } = setup([mail('a'), mail('b')]);
    const result = await service.deliverDue(NOW);
    expect(repo.claimDue).toHaveBeenCalledWith(NOW, new Date(NOW.getTime() + MAIL.leaseMs), MAIL.batchSize);
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenCalledWith({
      to: 'a@test.vn',
      cc: [],
      subject: 's',
      html: '<p>h</p>',
      text: 'h',
    });
    expect(repo.markSent).toHaveBeenCalledWith('a', NOW);
    expect(result).toEqual({ sent: 2, retried: 0, failed: 0 });
  });

  it('lỗi tạm thời → hẹn thử lại theo backoff; một mail lỗi không chặn mail khác', async () => {
    const { repo, sender, service } = setup([mail('a', 2), mail('b')]);
    sender.send.mockRejectedValueOnce(new Error('ECONNRESET'));
    const result = await service.deliverDue(NOW);
    expect(repo.markRetry).toHaveBeenCalledWith(
      'a',
      new Date(NOW.getTime() + MAIL.backoffMs[1]),
      'Error: ECONNRESET',
    );
    expect(repo.markSent).toHaveBeenCalledWith('b', NOW);
    expect(result).toEqual({ sent: 1, retried: 1, failed: 0 });
  });

  it('hết lượt thử → FAILED', async () => {
    const { repo, sender, service } = setup([mail('a', MAIL.maxAttempts)]);
    sender.send.mockRejectedValueOnce(new Error('timeout'));
    expect(await service.deliverDue(NOW)).toEqual({ sent: 0, retried: 0, failed: 1 });
    expect(repo.markFailed).toHaveBeenCalledWith('a', 'Error: timeout');
    expect(repo.markRetry).not.toHaveBeenCalled();
  });

  it('lỗi vĩnh viễn (địa chỉ bị từ chối) → FAILED ngay ở lần đầu', async () => {
    const { repo, sender, service } = setup([mail('a', 1)]);
    sender.send.mockRejectedValueOnce(new PermanentMailError('550 no such user'));
    expect(await service.deliverDue(NOW)).toEqual({ sent: 0, retried: 0, failed: 1 });
    expect(repo.markFailed).toHaveBeenCalledWith('a', 'Error: 550 no such user');
  });

  it('không có mail đến hạn → không gửi gì', async () => {
    const { sender, service } = setup([]);
    expect(await service.deliverDue(NOW)).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(sender.send).not.toHaveBeenCalled();
  });
});
