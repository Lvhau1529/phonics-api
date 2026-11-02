import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type Env } from '@/config/env.schema';
import { type TimeService } from '@/core/time/time.service';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { AttendanceDigestService } from '@/modules/extra-lessons/services/attendance-digest.service';
import { type MailOutboxService } from '@/modules/mail/services/mail-outbox.service';

const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };
const session = (id: string, teacherIds: string[]) => ({
  id,
  date: '2026-11-02',
  startTime: '17:00',
  endTime: '18:00',
  teacherIds,
  presentCount: 2,
  recordsVersion: 1,
  slot: { name: 'Ca A' },
  _count: { records: 2 },
});

function setup() {
  const repo = mockDeep<AttendanceRepository>();
  const mail = mockDeep<MailOutboxService>();
  const audit = mockDeep<AuditService>();
  const time = { toIsoDate: () => '2026-11-02' } as unknown as TimeService;
  const service = new AttendanceDigestService(repo, mail, audit, time, {
    ADMIN_APP_URL: 'https://admin.test',
  } as Env);
  repo.transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn({})) as never);
  repo.createDigest.mockResolvedValue({ id: 'd1' });
  return { repo, mail, audit, service };
}

describe('AttendanceDigestService.resend', () => {
  it('mỗi GV một mail thủ công (manual, dedupe theo digest), GV thiếu email + buổi không còn PENDING báo riêng', async () => {
    const { repo, mail, audit, service } = setup();
    repo.pendingByIds.mockResolvedValue([session('s1', ['t1', 't2']), session('s2', ['t1'])] as never);
    repo.teachers.mockResolvedValue([
      { id: 't1', displayName: 'Cô Lan', email: 'lan@x.vn', avatarKey: null },
      { id: 't2', displayName: 'Mr. Nam', email: null, avatarKey: null },
    ] as never);

    const res = await service.resend(admin, ['s1', 's2', 's3']);

    expect(res).toEqual({
      sent: [{ teacherId: 't1', teacherName: 'Cô Lan', sessionCount: 2 }],
      noEmail: [{ teacherId: 't2', teacherName: 'Mr. Nam' }],
      skipped: ['s3'],
    });
    expect(repo.createDigest).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ teacherId: 't1', manual: true }),
    );
    expect(mail.enqueueTemplate.mock.calls[0]?.[0][0]).toMatchObject({
      key: 'teacher.digest',
      to: 'lan@x.vn',
      dedupeKey: 'digest:resend:d1',
    });
    expect(repo.bumpDigestCount).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'attendance.resendDigest',
      'AttendanceDigest',
      'd1',
      null,
      {
        teacherId: 't1',
        sessionIds: ['s1', 's2'],
      },
    );
    expect(mail.flush).toHaveBeenCalled();
  });
});
