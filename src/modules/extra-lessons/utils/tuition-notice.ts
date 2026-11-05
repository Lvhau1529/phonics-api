/** Gom bé theo phụ huynh nhận học phí để soạn tin nhắn thông báo học phí (Zalo) — hàm thuần */
import { type TuitionNotice, type TuitionNoticeStudent } from '@phonics/contracts';
import { renderTransferContent, shortName } from '@/modules/extra-lessons/utils/tuition-statement';

export interface NoticeStudentRow {
  id: string;
  vietnameseName: string;
  englishName: string | null;
  className: string | null;
  /** Phụ huynh nhận học phí (chưa xoá); null = chưa gắn */
  guardian: { id: string; fullName: string; phone: string | null } | null;
}

export interface NoticeTotalRow {
  studentId: string;
  confirmedTotal: number;
  pendingTotal: number;
}

/**
 * Mỗi phụ huynh nhận học phí một tin (anh chị em gộp, giữ thứ tự bé đầu tiên xuất hiện — danh sách vào đã sắp theo
 * tên); bé chưa có phụ huynh nhận học phí thành một dòng riêng. Nội dung chuyển khoản điền như phiếu PDF.
 */
export function groupNotices(
  students: readonly NoticeStudentRow[],
  totals: readonly NoticeTotalRow[],
  opts: { month: string; transferTemplate: string | null },
): TuitionNotice[] {
  const byStudent = new Map(totals.map((t) => [t.studentId, t]));
  const groups = new Map<string, { row: NoticeStudentRow; students: TuitionNoticeStudent[] }>();
  for (const s of students) {
    const key = s.guardian?.id ?? `student:${s.id}`;
    const total = byStudent.get(s.id);
    const student: TuitionNoticeStudent = {
      id: s.id,
      vietnameseName: s.vietnameseName,
      englishName: s.englishName,
      className: s.className,
      confirmedTotal: total?.confirmedTotal ?? 0,
      pendingTotal: total?.pendingTotal ?? 0,
    };
    const group = groups.get(key);
    if (group) group.students.push(student);
    else groups.set(key, { row: s, students: [student] });
  }
  return [...groups].map(([key, { row, students: list }]) => ({
    key,
    guardianId: row.guardian?.id ?? null,
    guardianName: row.guardian?.fullName ?? null,
    phone: row.guardian?.phone ?? null,
    students: list,
    confirmedTotal: list.reduce((sum, s) => sum + s.confirmedTotal, 0),
    pendingTotal: list.reduce((sum, s) => sum + s.pendingTotal, 0),
    transferContent: renderTransferContent(opts.transferTemplate, {
      month: opts.month,
      students: list.map(shortName),
      phone: row.guardian?.phone ?? null,
    }),
  }));
}
