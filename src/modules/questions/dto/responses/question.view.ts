/** Dựng QuestionSummary / QuestionView (shape contracts) từ dòng Prisma — hàm thuần */
import {
  type MediaMap,
  type QuestionAnswerKey,
  type QuestionConfig,
  type QuestionExample,
  type QuestionSummary,
  type QuestionView,
} from '@phonics/contracts';
import { type QuestionRow } from '../../types/question.types';
import { thumbnailOf } from '../../utils/question-content';

export function toQuestionSummary(row: QuestionRow, media: MediaMap): QuestionSummary {
  return {
    id: row.id,
    type: row.type,
    gradingMode: row.gradingMode,
    instruction: row.instruction,
    instructionVi: row.instructionVi,
    points: row.points,
    tags: row.tags,
    status: row.status,
    visibility: row.visibility,
    createdById: row.createdById,
    createdByName: row.createdBy.displayName,
    usedInWorksheets: row._count.items,
    thumbnail: thumbnailOf(row.config, media),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toQuestionView(row: QuestionRow, media: MediaMap): QuestionView {
  return {
    ...toQuestionSummary(row, media),
    example: (row.example as QuestionExample | null) ?? null,
    config: row.config as unknown as QuestionConfig,
    answerKey: row.answerKey as unknown as QuestionAnswerKey,
    media,
  };
}
