import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { ValidationMessage } from './common/validation-messages.js';
import { Grade } from './classes.js';
import { MediaMap } from './media.js';
import {
  ContentStatus,
  GradingMode,
  Instruction,
  Points,
  QuestionAnswerKey,
  QuestionConfig,
  QuestionExample,
  QuestionSummary,
  QuestionType,
  QuestionView,
  Visibility,
} from './questions.js';

/**
 * Worksheet = phiếu bài tập: metadata (môn, chủ đề, tuần, ngày, loại) + các Part (section) + các câu (item).
 * Khi giao cho lớp, nội dung được đóng băng thành `WorksheetSnapshot` (ADR 0017).
 */
export const Subject = z.enum(['PHONICS', 'ESL']);
export type Subject = z.infer<typeof Subject>;

export const WorksheetKind = z.enum(['EXTRA', 'HANDOUT', 'WORKSHEET']);
export type WorksheetKind = z.infer<typeof WorksheetKind>;

/** Ngày trong tuần học: D1..D5 */
export const WorksheetDay = z.int().min(1).max(5);
export const WorksheetTitle = z.string().trim().min(1).max(120);
export const SectionTitle = z.string().trim().min(1).max(60);

export const CreateWorksheetBody = z.strictObject({
  title: WorksheetTitle,
  subject: Subject.default('PHONICS'),
  /** "Letter Nn" */
  topic: z.string().trim().max(80).optional(),
  grade: Grade.optional(),
  week: z.int().min(1).max(52).optional(),
  day: WorksheetDay.optional(),
  kind: WorksheetKind.default('WORKSHEET'),
  visibility: Visibility.default('SHARED'),
  note: z.string().trim().max(1000).optional(),
});
export type CreateWorksheetBody = z.infer<typeof CreateWorksheetBody>;

export const UpdateWorksheetBody = z
  .strictObject({
    title: WorksheetTitle,
    subject: Subject,
    topic: z.string().trim().max(80).nullable(),
    grade: Grade.nullable(),
    week: z.int().min(1).max(52).nullable(),
    day: WorksheetDay.nullable(),
    kind: WorksheetKind,
    visibility: Visibility,
    note: z.string().trim().max(1000).nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, ValidationMessage.atLeastOneField);
export type UpdateWorksheetBody = z.infer<typeof UpdateWorksheetBody>;

/** PUT /worksheets/:id/structure — thay toàn bộ sections + items. Có `id` thì giữ (ổn định cho snapshot), không có = tạo mới */
export const WorksheetStructureBody = z.strictObject({
  sections: z
    .array(
      z.strictObject({
        id: Id.optional(),
        title: SectionTitle,
        instruction: Instruction.optional(),
        items: z
          .array(z.strictObject({ id: Id.optional(), questionId: Id, pointsOverride: Points.optional() }))
          .max(50),
      }),
    )
    .min(1)
    .max(20),
});
export type WorksheetStructureBody = z.infer<typeof WorksheetStructureBody>;

export const WorksheetItemView = z.object({
  id: Id,
  order: z.int().min(0),
  questionId: Id,
  pointsOverride: Points.nullable(),
  /** Điểm hiệu lực = pointsOverride ?? question.points */
  points: Points,
  question: QuestionSummary,
});
export type WorksheetItemView = z.infer<typeof WorksheetItemView>;

export const WorksheetSectionView = z.object({
  id: Id,
  order: z.int().min(0),
  title: SectionTitle,
  instruction: z.string().nullable(),
  items: z.array(WorksheetItemView),
});
export type WorksheetSectionView = z.infer<typeof WorksheetSectionView>;

export const WorksheetSummary = z.object({
  id: Id,
  title: WorksheetTitle,
  subject: Subject,
  topic: z.string().nullable(),
  grade: z.string().nullable(),
  week: z.int().nullable(),
  day: z.int().nullable(),
  kind: WorksheetKind,
  status: ContentStatus,
  visibility: Visibility,
  note: z.string().nullable(),
  itemCount: z.int().min(0),
  maxScore: z.int().min(0),
  assignmentCount: z.int().min(0),
  createdById: Id,
  createdByName: z.string(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorksheetSummary = z.infer<typeof WorksheetSummary>;

export const WorksheetDetail = WorksheetSummary.extend({
  sections: z.array(WorksheetSectionView),
  /** Nội dung đầy đủ (kể cả answerKey) của mọi câu trong phiếu, để preview / in */
  questions: z.record(Id, QuestionView),
  media: MediaMap,
});
export type WorksheetDetail = z.infer<typeof WorksheetDetail>;

export const WorksheetListQuery = PageQuery.extend({
  status: ContentStatus.optional(),
  visibility: Visibility.optional(),
  subject: Subject.optional(),
  kind: WorksheetKind.optional(),
  grade: Grade.optional(),
  week: z.coerce.number().int().min(1).max(52).optional(),
  mine: z.coerce.boolean().optional(),
  createdById: Id.optional(),
});
export type WorksheetListQuery = z.infer<typeof WorksheetListQuery>;

// ---------- Snapshot (lưu trong assignments.snapshot) ----------
export const SnapshotQuestion = z.object({
  id: Id,
  type: QuestionType,
  gradingMode: GradingMode,
  instruction: Instruction,
  instructionVi: z.string().nullable(),
  example: QuestionExample.nullable(),
  config: QuestionConfig,
  answerKey: QuestionAnswerKey,
});
export type SnapshotQuestion = z.infer<typeof SnapshotQuestion>;

export const SnapshotItem = z.object({
  /** = worksheet_items.id lúc giao; submission_answers tham chiếu id này */
  worksheetItemId: Id,
  order: z.int().min(0),
  points: Points,
  question: SnapshotQuestion,
});
export type SnapshotItem = z.infer<typeof SnapshotItem>;

export const SnapshotSection = z.object({
  id: Id,
  order: z.int().min(0),
  title: SectionTitle,
  instruction: z.string().nullable(),
  items: z.array(SnapshotItem),
});
export type SnapshotSection = z.infer<typeof SnapshotSection>;

export const WorksheetSnapshot = z.object({
  worksheetId: Id,
  title: WorksheetTitle,
  subject: Subject,
  topic: z.string().nullable(),
  grade: z.string().nullable(),
  week: z.int().nullable(),
  day: z.int().nullable(),
  kind: WorksheetKind,
  sections: z.array(SnapshotSection),
  maxScore: z.int().min(0),
  snapshotAt: IsoDateTime,
});
export type WorksheetSnapshot = z.infer<typeof WorksheetSnapshot>;

/** Bản cho học sinh: bỏ answerKey */
export const StudentSnapshotQuestion = SnapshotQuestion.omit({ answerKey: true });
export type StudentSnapshotQuestion = z.infer<typeof StudentSnapshotQuestion>;
export const StudentSnapshotItem = SnapshotItem.extend({ question: StudentSnapshotQuestion });
export type StudentSnapshotItem = z.infer<typeof StudentSnapshotItem>;
export const StudentSnapshotSection = SnapshotSection.extend({ items: z.array(StudentSnapshotItem) });
export const StudentWorksheetView = WorksheetSnapshot.extend({ sections: z.array(StudentSnapshotSection) });
export type StudentWorksheetView = z.infer<typeof StudentWorksheetView>;

/** Danh sách item phẳng theo thứ tự section → item (dùng cả API lẫn client) */
export const flattenSnapshotItems = <S extends { items: readonly I[] }, I>(sections: readonly S[]): I[] =>
  sections.flatMap((s) => s.items as I[]);
