import { AsyncResource } from 'node:async_hooks';
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { WORKSHEETS } from '@/config/constants';
import { AssignmentRepository } from '@/modules/assignments/repositories/assignment.repository';
import { AssignmentLifecycleService } from '@/modules/assignments/services/assignment-lifecycle.service';

/** Giới hạn của setTimeout (~24,8 ngày); mốc xa hơn thì thức dậy rồi tính lại */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Mở bài SCHEDULED tới giờ, đóng bài OPEN quá hạn (không cho nộp muộn). Không dùng cron định kỳ: hẹn một timer đúng
 * mốc kế tiếp, nên khi không có bài nào sắp mở / đóng thì không truy vấn DB, và mở / đóng đúng giây thay vì trễ tới
 * 5 phút như cron định kỳ. Mốc đổi khi GV tạo / sửa / đóng / mở lại / xoá bài → writer gọi
 * `reschedule()`; API khởi động lại thì tính lại ở bootstrap.
 */
@Injectable()
export class AssignmentsScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AssignmentsScheduler.name);
  private timer?: NodeJS.Timeout;
  /** Lần reschedule mới nhất — kết quả của lần cũ hơn (await xong muộn) bị bỏ */
  private seq = 0;
  private readonly root = new AsyncResource(AssignmentsScheduler.name);

  constructor(
    private readonly repo: AssignmentRepository,
    private readonly lifecycle: AssignmentLifecycleService,
  ) {}

  onApplicationBootstrap(): void {
    void this.reschedule();
  }

  onApplicationShutdown(): void {
    this.seq += 1;
    clearTimeout(this.timer);
  }

  /** Tính lại mốc kế tiếp và hẹn timer; không có bài chờ mở / đóng thì không hẹn gì */
  async reschedule(): Promise<void> {
    const seq = ++this.seq;
    clearTimeout(this.timer);
    try {
      const next = await this.repo.nextTransitionAt();
      if (seq !== this.seq) return;
      if (next) this.arm(seq, next.getTime() - Date.now());
    } catch (err) {
      this.logger.error(`Không tính được mốc mở / đóng bài: ${String(err)}`);
      if (seq === this.seq) this.arm(seq, WORKSHEETS.assignmentRetryMs);
    }
  }

  private arm(seq: number, delayMs: number): void {
    // Chạy trong context lúc tạo scheduler, không kế thừa request đã gọi reschedule() (log khỏi dính req của GV)
    const run = this.root.bind(() => void this.fire(seq));
    this.timer = setTimeout(run, Math.min(Math.max(delayMs, 0), MAX_TIMEOUT_MS));
  }

  private async fire(seq: number): Promise<void> {
    if (seq !== this.seq) return;
    try {
      await this.lifecycle.tick();
    } catch (err) {
      // Không reschedule ngay (mốc vẫn ở quá khứ → lặp sát nhau); thử lại sau
      this.logger.error(`Mở / đóng bài lỗi: ${String(err)}`);
      if (seq === this.seq) this.arm(seq, WORKSHEETS.assignmentRetryMs);
      return;
    }
    await this.reschedule();
  }
}
