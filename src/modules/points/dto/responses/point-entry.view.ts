import { type PointEntryView } from '@phonics/contracts';
import { type PointEntryRow } from '@/modules/points/types/point.types';

export function toEntryView(row: PointEntryRow): PointEntryView {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.user.displayName,
    classId: row.classId,
    className: row.class?.name ?? null,
    gameId: (row.gameId as PointEntryView['gameId']) ?? null,
    kind: row.kind,
    points: row.points,
    note: row.note,
    gameResultId: row.gameResultId,
    createdById: row.createdById,
    createdByName: row.createdBy?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Tiêu đề thông báo điểm thưởng cho học sinh (tiếng Anh ngắn) */
export function bonusTitle(points: number, actorName: string): string {
  return `${points > 0 ? '+' : ''}${points} points from ${actorName}`;
}
