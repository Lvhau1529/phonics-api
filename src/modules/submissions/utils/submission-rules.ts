/** Luật thuần của bài nộp: tổng điểm, kiểm tra câu trả lời / điểm chấm so với snapshot */
import {
  type GradeSubmissionBody,
  type SaveAnswersBody,
  type SnapshotItem,
  type WorksheetSnapshot,
} from '@phonics/contracts';
import { sumBy } from 'es-toolkit';
import { AppError } from '@/common/errors/app-error';
import { itemsOf } from '@/modules/worksheets/utils/worksheet-snapshot';
import { round2 } from '@/modules/submissions/grading/index';
import { type SubmissionAnswerRow, type SubmissionRow } from '@/modules/submissions/types/submission.types';

/** Tổng điểm cuối = Σ (điểm GV ?? điểm tự chấm ?? 0) */
export function totalOf(answers: readonly Pick<SubmissionAnswerRow, 'manualScore' | 'autoScore'>[]): number {
  return round2(sumBy(answers, (a) => a.manualScore ?? a.autoScore ?? 0));
}

export const snapshotOf = (row: Pick<SubmissionRow, 'assignment'>): WorksheetSnapshot =>
  row.assignment.snapshot as unknown as WorksheetSnapshot;

/** Câu trong snapshot theo worksheetItemId */
export const itemMapOf = (snapshot: WorksheetSnapshot): Map<string, SnapshotItem> =>
  new Map(itemsOf(snapshot).map((it) => [it.worksheetItemId, it]));

/** Câu trả lời phải thuộc phiếu và đúng dạng câu trong snapshot */
export function assertAnswersMatch(
  items: Map<string, SnapshotItem>,
  answers: SaveAnswersBody['answers'],
): void {
  const mismatch: string[] = [];
  const unknown: string[] = [];
  for (const a of answers) {
    const item = items.get(a.worksheetItemId);
    if (!item) unknown.push(a.worksheetItemId);
    else if (a.answer.type !== item.question.type) mismatch.push(a.worksheetItemId);
  }
  if (unknown.length) throw new AppError('VALIDATION_ERROR', 400, { details: { worksheetItemId: unknown } });
  if (mismatch.length)
    throw new AppError('ANSWER_TYPE_MISMATCH', 400, { details: { worksheetItemId: mismatch } });
}

/** Điểm chấm tay phải thuộc phiếu và không vượt điểm tối đa của câu */
export function assertGradesValid(
  items: Map<string, SnapshotItem>,
  grades: GradeSubmissionBody['items'],
): void {
  const overMax: string[] = [];
  const unknown: string[] = [];
  for (const g of grades) {
    const item = items.get(g.worksheetItemId);
    if (!item) unknown.push(g.worksheetItemId);
    else if (g.manualScore > item.points) overMax.push(g.worksheetItemId);
  }
  if (unknown.length) throw new AppError('VALIDATION_ERROR', 400, { details: { worksheetItemId: unknown } });
  if (overMax.length)
    throw new AppError('VALIDATION_ERROR', 400, {
      fieldErrors: { manualScore: overMax.map((id) => ['overMaxScore', { id }] as const) },
    });
}

/** Câu chấm tay chưa có điểm (chặn chốt điểm) */
export function pendingManualItems(
  items: Map<string, SnapshotItem>,
  answers: readonly Pick<SubmissionAnswerRow, 'worksheetItemId' | 'manualScore'>[],
): string[] {
  return [...items.values()]
    .filter((it) => it.question.gradingMode === 'MANUAL')
    .filter((it) => answers.find((a) => a.worksheetItemId === it.worksheetItemId)?.manualScore == null)
    .map((it) => it.worksheetItemId);
}
