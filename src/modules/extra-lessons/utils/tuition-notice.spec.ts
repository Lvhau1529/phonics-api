import { describe, expect, it } from 'vitest';
import { groupNotices, type NoticeStudentRow } from '@/modules/extra-lessons/utils/tuition-notice';

const lan = { id: 'g1', fullName: 'Nguyễn Thị Lan', phone: '+84912345678' };
const row = (
  id: string,
  name: string,
  guardian: NoticeStudentRow['guardian'],
  englishName: string | null = null,
) => ({
  id,
  vietnameseName: name,
  englishName,
  className: 'K2A',
  guardian,
});

describe('groupNotices', () => {
  it('gộp anh chị em theo phụ huynh nhận học phí, bé chưa có phụ huynh thành dòng riêng', () => {
    const notices = groupNotices(
      [
        row('s1', 'Nguyễn Văn An', lan, 'Andy'),
        row('s2', 'Trần Minh', null),
        row('s3', 'Nguyễn Thị Bình', lan),
      ],
      [
        { studentId: 's1', confirmedTotal: 300_000, pendingTotal: 100_000 },
        { studentId: 's3', confirmedTotal: 200_000, pendingTotal: 0 },
      ],
      { month: '2026-11', transferTemplate: 'HP {month} {students} {phone}' },
    );
    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({
      key: 'g1',
      guardianName: 'Nguyễn Thị Lan',
      phone: '+84912345678',
      confirmedTotal: 500_000,
      pendingTotal: 100_000,
      transferContent: 'HP T11 2026 ANDY BINH 0912345678',
    });
    expect(notices[0]!.students.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(notices[1]).toMatchObject({
      key: 'student:s2',
      guardianId: null,
      phone: null,
      confirmedTotal: 0,
      transferContent: 'HP T11 2026 MINH',
    });
  });

  it('chưa cài mẫu nội dung chuyển khoản → null', () => {
    const [n] = groupNotices([row('s1', 'An', lan)], [], { month: '2026-11', transferTemplate: null });
    expect(n!.transferContent).toBeNull();
  });
});
