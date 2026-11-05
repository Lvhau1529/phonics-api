import { describe, expect, it } from 'vitest';
import { EMPTY_TUITION_SETTINGS } from '@/modules/settings/services/tuition-settings.service';
import {
  asciiUpper,
  buildStatement,
  renderTransferContent,
  type StatementRecordRow,
  statementDueDate,
  statementSections,
} from '@/modules/extra-lessons/utils/tuition-statement';

const record = (
  studentId: string,
  date: string,
  over: Partial<Omit<StatementRecordRow, 'session'>> & {
    status?: 'PENDING' | 'CONFIRMED';
    kind?: 'EXTRA_CLASS' | 'TUTORING';
  } = {},
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
    kind: over.kind ?? 'EXTRA_CLASS',
    slot: { name: 'Ca T3', kind: over.kind ?? 'EXTRA_CLASS', startTime: '18:00', endTime: '19:30' },
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

  it('statementSections: tách học thêm / kèm cuối buổi; kèm chỉ giữ buổi có học hoặc vẫn tính phí', () => {
    const { students } = buildStatement({
      month: '2026-10',
      recipient: null,
      students: [{ id: 's1', vietnameseName: 'Trần Minh Khang', englishName: null }],
      records: [
        record('s1', '2026-10-07', { kind: 'TUTORING' }),
        record('s1', '2026-10-06'),
        record('s1', '2026-10-14', { kind: 'TUTORING', mark: 'EXCUSED', charged: false }),
        record('s1', '2026-10-21', { kind: 'TUTORING', mark: 'ABSENT', charged: true }),
        record('s1', '2026-10-13', { mark: 'ABSENT', charged: false }),
      ],
      settings: EMPTY_TUITION_SETTINGS,
      generatedAt: '',
    });
    const [st] = students;
    expect(st?.sections.map((x) => [x.kind, x.lines.map((l) => l.date), x.total])).toEqual([
      ['EXTRA_CLASS', ['2026-10-06', '2026-10-13'], 150_000],
      ['TUTORING', ['2026-10-07', '2026-10-21'], 300_000],
    ]);
    expect(st?.total).toBe(450_000);
    expect(statementSections([])).toEqual([]);
  });

  it('buổi theo ca in theo thông tin ca hiện tại (đã sửa), tiền vẫn theo đơn giá đã chốt; buổi bù giữ của buổi', () => {
    const old = record('s1', '2026-10-06', { unitPrice: 120_000 });
    const makeup = record('s1', '2026-10-08');
    const { students } = buildStatement({
      month: '2026-10',
      recipient: null,
      students: [{ id: 's1', vietnameseName: 'Trần Minh Khang', englishName: null }],
      records: [
        {
          ...old,
          session: {
            ...old.session,
            startTime: '17:00',
            endTime: '18:00',
            kind: 'EXTRA_CLASS',
            slot: { name: 'Kèm T2', kind: 'TUTORING', startTime: '19:30', endTime: '20:00' },
          },
        },
        { ...makeup, session: { ...makeup.session, startTime: '08:00', endTime: '09:00', slot: null } },
      ],
      settings: EMPTY_TUITION_SETTINGS,
      generatedAt: '',
    });
    const lines = students[0]?.lines ?? [];
    expect(lines.map((l) => [l.date, l.kind, l.slotName, l.startTime, l.amount])).toEqual([
      ['2026-10-06', 'TUTORING', 'Kèm T2', '19:30', 120_000],
      ['2026-10-08', 'EXTRA_CLASS', null, '08:00', 150_000],
    ]);
  });
});
