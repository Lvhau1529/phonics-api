import { AsyncResource } from 'node:async_hooks';
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { MAIL } from '@/config/constants';
import { MailDeliveryService } from '@/modules/mail/services/mail-delivery.service';

/** Giới hạn của setTimeout (~24,8 ngày); mốc xa hơn thì thức dậy rồi tính lại */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Gửi mail trong outbox. Không chạy cron định kỳ: hẹn một timer đúng mốc `next_attempt_at` sớm nhất của mail đang chờ
 * (gửi ngay / hẹn giờ / thử lại), hàng đợi trống thì không truy vấn DB. Có mail mới → `MailOutboxService` gọi
 * `reschedule()` sau commit; API khởi động lại thì tính lại ở bootstrap. Cùng khung với `AssignmentsScheduler`.
 */
@Injectable()
export class MailOutboxScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MailOutboxScheduler.name);
  private timer?: NodeJS.Timeout;
  /** Lần reschedule mới nhất — kết quả của lần cũ hơn (await xong muộn) bị bỏ */
  private seq = 0;
  private readonly root = new AsyncResource(MailOutboxScheduler.name);

  constructor(private readonly delivery: MailDeliveryService) {}

  onApplicationBootstrap(): void {
    void this.reschedule();
  }

  onApplicationShutdown(): void {
    this.seq += 1;
    clearTimeout(this.timer);
  }

  /** Tính lại mốc kế tiếp và hẹn timer; hàng đợi trống thì không hẹn gì */
  async reschedule(): Promise<void> {
    const seq = ++this.seq;
    clearTimeout(this.timer);
    try {
      const next = await this.delivery.nextDueAt();
      if (seq !== this.seq) return;
      if (next) this.arm(seq, next.getTime() - Date.now());
    } catch (err) {
      this.logger.error(`Không tính được mốc gửi mail: ${String(err)}`);
      if (seq === this.seq) this.arm(seq, MAIL.retryMs);
    }
  }

  private arm(seq: number, delayMs: number): void {
    // Chạy trong context lúc tạo scheduler, không kế thừa request đã gọi reschedule() (log khỏi dính req)
    const run = this.root.bind(() => void this.fire(seq));
    this.timer = setTimeout(run, Math.min(Math.max(delayMs, 0), MAX_TIMEOUT_MS));
  }

  private async fire(seq: number): Promise<void> {
    if (seq !== this.seq) return;
    try {
      await this.delivery.deliverDue();
    } catch (err) {
      // Không reschedule ngay (mốc vẫn ở quá khứ → lặp sát nhau); thử lại sau
      this.logger.error(`Gửi mail lỗi: ${String(err)}`);
      if (seq === this.seq) this.arm(seq, MAIL.retryMs);
      return;
    }
    await this.reschedule();
  }
}
