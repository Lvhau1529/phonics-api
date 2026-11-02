import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AttendanceDigestView,
  type ConfirmDigestBody,
  type ConfirmDigestResponse,
} from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { EXTRA_LESSONS } from '@/config/constants';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { dayjs } from '@/core/time/dayjs';
import { TimeService } from '@/core/time/time.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { hashToken } from '@/common/utils/hash-token';
import { AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { type DigestItem } from '@/modules/extra-lessons/types/extra.types';
import { MailOutboxService } from '@/modules/mail/services/mail-outbox.service';

const WEEKDAY_VI = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

/**
 * Mail 21:00 (§5.2): mỗi GV một mail các buổi PENDING (hôm nay + cũ còn treo, tối đa `maxDigests` lần nhắc / buổi).
 * Link mail = token ngẫu nhiên (DB lưu sha256) chỉ duyệt được các buổi trong mail, khi danh sách chưa đổi kể từ lúc gửi.
 * Mở link chỉ xem (bộ quét link không duyệt nhầm), bấm nút mới POST.
 */
@Injectable()
export class AttendanceDigestService {
  private readonly logger = new Logger(AttendanceDigestService.name);

  constructor(
    private readonly repo: AttendanceRepository,
    private readonly mail: MailOutboxService,
    private readonly audit: AuditService,
    private readonly time: TimeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Gửi mail của ngày `now` (idempotent: một mail / GV / ngày) — trả số mail xếp hàng */
  async sendDigests(now: Date): Promise<number> {
    const today = this.time.toIsoDate(now);
    const sessions = await this.repo.pendingForDigest(today, now, EXTRA_LESSONS.maxDigests);
    const byTeacher = new Map<string, typeof sessions>();
    for (const s of sessions) {
      for (const teacherId of s.teacherIds)
        byTeacher.set(teacherId, [...(byTeacher.get(teacherId) ?? []), s]);
    }
    if (!byTeacher.size) return 0;
    const teachers = new Map((await this.repo.teachers([...byTeacher.keys()])).map((t) => [t.id, t]));

    let sent = 0;
    const bumped = new Set<string>();
    for (const [teacherId, list] of byTeacher) {
      const teacher = teachers.get(teacherId);
      if (!teacher?.email || (await this.repo.digestExists(teacherId, today))) continue;
      const token = randomBytes(32).toString('base64url');
      const items: DigestItem[] = list.map((s) => ({ sessionId: s.id, recordsVersion: s.recordsVersion }));
      const confirmBase = `${this.env.ADMIN_APP_URL}/a/attendance/${token}`;
      await this.repo.transaction(async (tx) => {
        await this.repo.createDigest(tx, {
          teacherId,
          date: today,
          tokenHash: hashToken(token),
          expiresAt: dayjs(now).add(EXTRA_LESSONS.digestTokenDays, 'day').toDate(),
          items: items as unknown as object,
        });
        await this.mail.enqueueTemplate(
          [
            {
              key: 'teacher.digest',
              to: teacher.email,
              dedupeKey: `digest:${teacherId}:${today}`,
              refType: 'User',
              refId: teacherId,
              context: {
                teacherName: teacher.displayName,
                dateText: `${WEEKDAY_VI[dayjs(today).isoWeekday()]} ${dayjs(today).format('DD/MM')}`,
                count: list.length,
                sessions: list.map((s) => ({
                  name: s.slot?.name ?? 'Buổi bù',
                  dateText: dayjs(s.date).format('DD/MM'),
                  timeText: `${s.startTime}–${s.endTime}`,
                  isOld: s.date < today,
                  studentCount: s._count.records,
                  presentCount: s.presentCount,
                  absentCount: s._count.records - s.presentCount,
                  confirmLink: `${confirmBase}?session=${s.id}`,
                  editLink: `${this.env.ADMIN_APP_URL}/attendance/sessions/${s.id}`,
                })),
                confirmAllLink: confirmBase,
              },
            },
          ],
          tx,
        );
        // Một buổi nhiều GV: chỉ tính một lần nhắc / ngày
        const fresh = list.map((s) => s.id).filter((id) => !bumped.has(id));
        await this.repo.bumpDigestCount(tx, fresh);
        fresh.forEach((id) => bumped.add(id));
      });
      sent += 1;
    }
    if (sent) {
      this.mail.flush();
      this.logger.log(`Đã xếp hàng ${sent} mail điểm danh ${today}`);
    }
    return sent;
  }

  async view(token: string): Promise<AttendanceDigestView> {
    const digest = await this.findDigest(token);
    return this.toView(digest);
  }

  /** Duyệt nhanh: chỉ buổi trong mail, còn PENDING, danh sách chưa đổi kể từ lúc gửi */
  async confirm(token: string, body: ConfirmDigestBody): Promise<ConfirmDigestResponse> {
    const digest = await this.findDigest(token);
    const items = new Map(this.itemsOf(digest).map((i) => [i.sessionId, i.recordsVersion]));
    const sessions = new Map((await this.repo.digestSessions([...items.keys()])).map((s) => [s.id, s]));
    const result = { confirmed: [] as string[], alreadyConfirmed: [] as string[], rejected: [] as string[] };
    const at = new Date();
    for (const id of new Set(body.sessionIds)) {
      const session = sessions.get(id);
      const version = items.get(id);
      if (!session || version === undefined || session.status === 'CANCELLED') result.rejected.push(id);
      else if (session.status === 'CONFIRMED') result.alreadyConfirmed.push(id);
      else if (await this.repo.confirm(id, { userId: digest.teacherId, at, via: 'EMAIL' }, version)) {
        result.confirmed.push(id);
      } else result.rejected.push(id);
    }
    for (const id of result.confirmed) {
      await this.audit.record({ id: digest.teacherId }, 'attendance.confirm', 'AttendanceSession', id, null, {
        status: 'CONFIRMED',
        via: 'EMAIL',
      });
    }
    return { ...result, digest: await this.toView(digest) };
  }

  // ---- helpers ----

  private async findDigest(token: string) {
    const digest = await this.repo.findDigest(hashToken(token));
    if (!digest) throw new AppError('ATTENDANCE_TOKEN_INVALID', 404);
    if (dayjs(digest.expiresAt).isBefore(dayjs())) throw new AppError('ATTENDANCE_TOKEN_EXPIRED', 410);
    return digest;
  }

  private itemsOf(digest: { items: unknown }): DigestItem[] {
    return Array.isArray(digest.items) ? (digest.items as DigestItem[]) : [];
  }

  private async toView(
    digest: NonNullable<Awaited<ReturnType<AttendanceRepository['findDigest']>>>,
  ): Promise<AttendanceDigestView> {
    const items = new Map(this.itemsOf(digest).map((i) => [i.sessionId, i.recordsVersion]));
    const sessions = await this.repo.digestSessions([...items.keys()]);
    return {
      teacherName: digest.teacher.displayName,
      date: digest.date,
      expiresAt: digest.expiresAt.toISOString(),
      sessions: sessions.map((s) => ({
        id: s.id,
        slotName: s.slot?.name ?? null,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        studentCount: s._count.records,
        presentCount: s.presentCount,
        status: s.status,
        changed: s.status === 'PENDING' && s.recordsVersion !== items.get(s.id),
        confirmedByName: s.confirmedBy?.displayName ?? null,
        confirmedAt: s.confirmedAt?.toISOString() ?? null,
      })),
    };
  }
}
