import { AsyncResource } from 'node:async_hooks';
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { EXTRA_LESSONS } from '@/config/constants';
import { TimeService } from '@/core/time/time.service';
import { AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { AttendanceDigestService } from '@/modules/extra-lessons/services/attendance-digest.service';
import { SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';
import { hasPassed, nextDailyAt } from '@/modules/extra-lessons/utils/session-time';

/** Giới hạn của setTimeout (~24,8 ngày); mốc xa hơn thì thức dậy rồi tính lại */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Hai mốc mỗi ngày theo APP_TIMEZONE (§5.1): 00:05 tạo buổi của ngày, 21:00 gửi mail điểm danh cho GV. Hẹn timer đúng
 * mốc kế tiếp (khung `AssignmentsScheduler`), không quét DB định kỳ; không có ca / buổi chờ thì không hẹn. Mỗi lần
 * chạy làm bù việc bị lỡ (API tắt qua mốc) — idempotent nhờ unique (ca, ngày) và (GV, ngày). Ghi ca → `reschedule()`.
 */
@Injectable()
export class ExtraLessonsScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ExtraLessonsScheduler.name);
  private timer?: NodeJS.Timeout;
  /** Lần chạy mới nhất — kết quả của lần cũ hơn (await xong muộn) bị bỏ */
  private seq = 0;
  private readonly root = new AsyncResource(ExtraLessonsScheduler.name);

  constructor(
    private readonly repo: AttendanceRepository,
    private readonly sessions: SessionSyncService,
    private readonly digests: AttendanceDigestService,
    private readonly time: TimeService,
  ) {}

  onApplicationBootstrap(): void {
    void this.reschedule();
  }

  onApplicationShutdown(): void {
    this.seq += 1;
    clearTimeout(this.timer);
  }

  /** Ca đổi (tạo / sửa thứ / lưu trữ): làm ngay phần việc tới hạn rồi hẹn lại */
  reschedule(): Promise<void> {
    return this.run(++this.seq);
  }

  /** Tạo buổi còn thiếu + (sau 21:00) gửi mail của hôm nay */
  async tick(now = new Date()): Promise<void> {
    await this.sessions.ensureSessions(now);
    if (hasPassed(now, this.time.toIsoDate(now), EXTRA_LESSONS.digestTime, this.time.timeZone)) {
      await this.digests.sendDigests(now);
    }
  }

  private async run(seq: number): Promise<void> {
    clearTimeout(this.timer);
    try {
      await this.tick();
      const next = await this.nextAt(new Date());
      if (seq === this.seq && next) this.arm(seq, next.getTime() - Date.now());
    } catch (err) {
      // Không chạy lại ngay (mốc vẫn ở quá khứ → lặp sát nhau); thử lại sau
      this.logger.error(`Tạo buổi / gửi mail điểm danh lỗi: ${String(err)}`);
      if (seq === this.seq) this.arm(seq, EXTRA_LESSONS.retryMs);
    }
  }

  /** Mốc kế tiếp: 00:05 khi còn ca hoạt động, 21:00 khi còn ca hoặc buổi chờ xác nhận */
  private async nextAt(now: Date): Promise<Date | null> {
    const [slots, pending] = await Promise.all([this.repo.hasActiveSlots(), this.repo.hasPendingSessions()]);
    const tz = this.time.timeZone;
    const candidates = [
      ...(slots ? [nextDailyAt(now, EXTRA_LESSONS.sessionTime, tz)] : []),
      ...(slots || pending ? [nextDailyAt(now, EXTRA_LESSONS.digestTime, tz)] : []),
    ];
    return candidates.length ? new Date(Math.min(...candidates.map((d) => d.getTime()))) : null;
  }

  private arm(seq: number, delayMs: number): void {
    // Chạy trong context lúc tạo scheduler, không kế thừa request đã gọi reschedule()
    const run = this.root.bind(() => void this.run(seq));
    this.timer = setTimeout(run, Math.min(Math.max(delayMs, 0), MAX_TIMEOUT_MS));
  }
}
