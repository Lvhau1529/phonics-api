import { describe, expect, it } from 'vitest';
import { EMPTY_TUITION_SETTINGS } from '@/modules/settings/services/tuition-settings.service';
import {
  asciiUpper,
  buildStatement,
  renderTransferContent,
  type StatementRecordRow,
  statementDueDate,
} from '@/modules/extra-lessons/utils/tuition-statement';

const record = (
  studentId: string,
  date: string,
  over: Partial<Omit<StatementRecordRow, 'session'>> & { status?: 'PENDING' | 'CONFIRMED' } = {},
): StatementRecordRow => ({
  studentId,
  mark: 'PRESENT',
  charged: true,
  unitPrice: 150_000,
  ...over,
  session: {
    date,
    startTime: '18:00',
    endTime: '19:30',
    status: over.status ?? 'CONFIRMED',
    slot: { name: 'Ca T3' },
  },
});

describe('tuition-statement', () => {
  it('asciiUpper bỏ dấu, đ → D, bỏ ký tự lạ', () => {
    expect(asciiUpper('  Học phí — Đức Anh (T10/2026) ')).toBe('HOC PHI DUC ANH T10 2026');
  });

  it('renderTransferContent điền biến, cắt 50 ký tự; mẫu trống → null', () => {
    expect(
      renderTransferContent('HP {month} {students} {phone}', {
        month: '2026-10',
        students: ['Tom', 'Bống'],
        phone: '+84912345678',
      }),
    ).toBe('HP T10 2026 TOM BONG 0912345678');
    expect(renderTransferContent(null, { month: '2026-10', students: [], phone: null })).toBeNull();
    expect(
      renderTransferContent('{students}', { month: '2026-10', students: ['A'.repeat(80)], phone: null }),
    ).toHaveLength(50);
  });

  it('hạn đóng = ngày dueDay của tháng sau (qua năm)', () => {
    expect(statementDueDate('2026-12', 10)).toBe('2027-01-10');
    expect(statementDueDate('2026-12', null)).toBeNull();
  });

  it('buildStatement: gộp theo bé, buổi không tính phí = 0đ, cờ buổi chờ xác nhận', () => {
    const statement = buildStatement({
      month: '2026-10',
      recipient: { fullName: 'Nguyễn Thị Mai', phone: null },
      students: [
        { id: 's1', vietnameseName: 'Trần Minh Khang', englishName: null },
        { id: 's2', vietnameseName: 'Trần Bảo Ngọc', englishName: 'Ruby' },
      ],
      records: [
        record('s1', '2026-10-13'),
        record('s1', '2026-10-06', { mark: 'ABSENT', charged: false }),
        record('s2', '2026-10-07', { unitPrice: 200_000, status: 'PENDING' }),
      ],
      settings: { ...EMPTY_TUITION_SETTINGS, transferContent: 'HP {month} {students}', dueDay: 5 },
      generatedAt: '03/11/2026 08:00',
    });
    expect(statement.students.map((s) => [s.total, s.chargedCount])).toEqual([
      [150_000, 1],
      [200_000, 1],
    ]);
    expect(statement.students[0]?.lines.map((l) => [l.date, l.amount])).toEqual([
      ['2026-10-06', 0],
      ['2026-10-13', 150_000],
    ]);
    expect(statement.total).toBe(350_000);
    expect(statement.hasPending).toBe(true);
    expect(statement.transferContent).toBe('HP T10 2026 KHANG RUBY');
    expect(statement.dueDate).toBe('2026-11-05');
  });
});
