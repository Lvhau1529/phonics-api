import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { MAIL } from '@/config/constants';
import { MailOutboxScheduler } from '@/modules/mail/jobs/mail-outbox.scheduler';
import { type MailDeliveryService } from '@/modules/mail/services/mail-delivery.service';

const NOW = new Date('2026-11-01T14:00:00.000Z');
const MIN = 60_000;

function setup() {
  const delivery = mockDeep<MailDeliveryService>();
  delivery.deliverDue.mockResolvedValue({ sent: 0, retried: 0, failed: 0 });
  return { delivery, scheduler: new MailOutboxScheduler(delivery) };
}

describe('MailOutboxScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('hàng đợi trống → không hẹn timer, không gửi', async () => {
    const { delivery, scheduler } = setup();
    delivery.nextDueAt.mockResolvedValue(null);
    await scheduler.reschedule();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(24 * 60 * MIN);
    expect(delivery.deliverDue).not.toHaveBeenCalled();
  });

  it('gửi đúng mốc hẹn giờ rồi tính lại mốc', async () => {
    const { delivery, scheduler } = setup();
    delivery.nextDueAt.mockResolvedValueOnce(new Date(NOW.getTime() + 10 * MIN)).mockResolvedValue(null);
    await scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(10 * MIN - 1);
    expect(delivery.deliverDue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(delivery.deliverDue).toHaveBeenCalledTimes(1);
    expect(delivery.nextDueAt).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('khởi động lại có mail quá hạn → gửi ngay; lô đầy thì gửi tiếp lô sau ngay', async () => {
    const { delivery, scheduler } = setup();
    delivery.nextDueAt
      .mockResolvedValueOnce(new Date(NOW.getTime() - MIN))
      .mockResolvedValueOnce(new Date(NOW.getTime() - MIN))
      .mockResolvedValue(null);
    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1);
    expect(delivery.deliverDue).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('có mail mới gửi sớm hơn → reschedule thay timer cũ', async () => {
    const { delivery, scheduler } = setup();
    delivery.nextDueAt.mockResolvedValueOnce(new Date(NOW.getTime() + 60 * MIN));
    await scheduler.reschedule();
    delivery.nextDueAt.mockResolvedValueOnce(new Date(NOW.getTime() + MIN)).mockResolvedValue(null);
    await scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(MIN);
    expect(delivery.deliverDue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(delivery.deliverDue).toHaveBeenCalledTimes(1);
  });

  it('lỗi DB → thử lại sau retryMs, không lặp sát nhau', async () => {
    const { delivery, scheduler } = setup();
    delivery.nextDueAt.mockResolvedValueOnce(NOW).mockResolvedValue(null);
    delivery.deliverDue.mockRejectedValueOnce(new Error('db down'));
    await scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(0);
    expect(delivery.deliverDue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MAIL.retryMs - 1);
    expect(delivery.deliverDue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(delivery.deliverDue).toHaveBeenCalledTimes(2);
  });

  it('shutdown huỷ timer', async () => {
    const { delivery, scheduler } = setup();
    delivery.nextDueAt.mockResolvedValue(new Date(NOW.getTime() + MIN));
    await scheduler.reschedule();
    scheduler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(delivery.deliverDue).not.toHaveBeenCalled();
  });
});
