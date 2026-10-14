/** Dựng WorksheetSummary / WorksheetDetail (shape contracts) từ dòng Prisma — hàm thuần */
import {
  type MediaMap,
  type QuestionView,
  type WorksheetDetail,
  type WorksheetSectionView,
  type WorksheetSummary,
} from '@phonics/contracts';
import { sumBy } from 'es-toolkit';
import { toQuestionSummary, toQuestionView } from '@/modules/questions/dto/responses/question.view';
import {
  type WorksheetDetailRow,
  type WorksheetSummaryRow,
} from '@/modules/worksheets/types/worksheet.types';

export function toWorksheetSummary(row: WorksheetSummaryRow): WorksheetSummary {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    topic: row.topic,
    grade: row.grade,
    week: row.week,
    day: row.day,
    kind: row.kind,
    status: row.status,
    visibility: row.visibility,
    note: row.note,
    itemCount: row.items.length,
    maxScore: sumBy(row.items, (it) => it.pointsOverride ?? it.question.points),
    assignmentCount: row._count.assignments,
    createdById: row.createdById,
    createdByName: row.createdBy.displayName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWorksheetDetail(row: WorksheetDetailRow, media: MediaMap): WorksheetDetail {
  const questions: Record<string, QuestionView> = {};
  const sections: WorksheetSectionView[] = row.sections.map((s) => ({
    id: s.id,
    order: s.order,
    title: s.title,
    instruction: s.instruction,
    items: s.items.map((it) => {
      questions[it.question.id] ??= toQuestionView(it.question, media);
      return {
        id: it.id,
        order: it.order,
        questionId: it.questionId,
        pointsOverride: it.pointsOverride,
        points: it.pointsOverride ?? it.question.points,
        question: toQuestionSummary(it.question, media),
      };
    }),
  }));
  return { ...toWorksheetSummary(row), sections, questions, media };
}
