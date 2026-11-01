import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import { type ClaimedMail } from '@/modules/mail/types/mail.types';

/** Mọi truy vấn của `mail_outbox` */
@Injectable()
export class MailOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Dòng trùng `dedupe_key` bị bỏ qua (gửi lại cùng việc không tạo mail thứ hai). Trả số dòng thêm mới. */
  async insertMany(
    rows: Prisma.MailOutboxCreateManyInput[],
    db: Tx | PrismaService = this.prisma,
  ): Promise<number> {
    if (!rows.length) return 0;
    const { count } = await db.mailOutbox.createMany({ data: rows, skipDuplicates: true });
    return count;
  }

  /** Mốc gửi / thử lại sớm nhất của mail đang chờ; null = hàng đợi trống */
  async nextDueAt(): Promise<Date | null> {
    const row = await this.prisma.mailOutbox.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { nextAttemptAt: 'asc' },
      select: { nextAttemptAt: true },
    });
    return row?.nextAttemptAt ?? null;
  }

  /**
   * Lấy tối đa `limit` mail đến hạn để gửi: tăng `attempts` và đẩy `next_attempt_at` tới `leaseUntil` trong cùng câu
   * lệnh — API chết giữa chừng thì mail tự đến hạn lại sau lease. `SKIP LOCKED`: hai tiến trình không lấy trùng.
   */
  claimDue(now: Date, leaseUntil: Date, limit: number): Promise<ClaimedMail[]> {
    return this.prisma.$queryRaw<ClaimedMail[]>`
      UPDATE mail_outbox
      SET    attempts = attempts + 1, next_attempt_at = ${leaseUntil}
      WHERE  id IN (
               SELECT id FROM mail_outbox
               WHERE  status = 'QUEUED' AND next_attempt_at <= ${now}
               ORDER  BY next_attempt_at
               LIMIT  ${limit}
               FOR UPDATE SKIP LOCKED)
      RETURNING id, to_email AS "toEmail", cc, subject, html, text, attempts`;
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.prisma.mailOutbox.update({ where: { id }, data: { status: 'SENT', sentAt, lastError: null } });
  }

  async markRetry(id: string, nextAttemptAt: Date, lastError: string): Promise<void> {
    await this.prisma.mailOutbox.update({ where: { id }, data: { nextAttemptAt, lastError } });
  }

  async markFailed(id: string, lastError: string): Promise<void> {
    await this.prisma.mailOutbox.update({ where: { id }, data: { status: 'FAILED', lastError } });
  }
}
