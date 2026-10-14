import {
  type QuestionAnswerKey,
  type QuestionConfig,
  type QuestionExample,
  type SnapshotItem,
  type StudentWorksheetView,
  WorksheetSnapshot,
  gradingModeOf,
} from '@phonics/contracts';
import { sumBy } from 'es-toolkit';

/** Dữ liệu tối thiểu từ Prisma (worksheet + sections + items + question) để dựng snapshot */
export interface SnapshotSource {
  id: string;
  title: string;
  subject: 'PHONICS' | 'ESL';
  topic: string | null;
  grade: string | null;
  week: number | null;
  day: number | null;
  kind: 'EXTRA' | 'HANDOUT' | 'WORKSHEET';
  sections: {
    id: string;
    order: number;
    title: string;
    instruction: string | null;
    items: {
      id: string;
      order: number;
      pointsOverride: number | null;
      question: {
        id: string;
        type: SnapshotItem['question']['type'];
        instruction: string;
        instructionVi: string | null;
        points: number;
        example: unknown;
        config: unknown;
        answerKey: unknown;
      };
    }[];
  }[];
}

/**
 * Đóng băng nội dung phiếu lúc giao (ADR 0017): mọi config / answerKey / điểm nằm trong JSON này;
 * sửa phiếu / câu hỏi sau đó không ảnh hưởng bài đã giao. Validate bằng contracts để JSON cũ không hợp lệ bị chặn sớm.
 */
export function buildSnapshot(source: SnapshotSource, now = new Date()): WorksheetSnapshot {
  const sections = [...source.sections]
    .sort((a, b) => a.order - b.order)
    .map((s, sIdx) => ({
      id: s.id,
      order: sIdx,
      title: s.title,
      instruction: s.instruction,
      items: [...s.items]
        .sort((a, b) => a.order - b.order)
        .map((it, iIdx) => ({
          worksheetItemId: it.id,
          order: iIdx,
          points: it.pointsOverride ?? it.question.points,
          question: {
            id: it.question.id,
            type: it.question.type,
            gradingMode: gradingModeOf(it.question.type),
            instruction: it.question.instruction,
            instructionVi: it.question.instructionVi,
            example: (it.question.example as QuestionExample | null) ?? null,
            config: it.question.config as QuestionConfig,
            answerKey: it.question.answerKey as QuestionAnswerKey,
          },
        })),
    }));
  const maxScore = sumBy(sections, (s) => sumBy(s.items, (it) => it.points));
  return WorksheetSnapshot.parse({
    worksheetId: source.id,
    title: source.title,
    subject: source.subject,
    topic: source.topic,
    grade: source.grade,
    week: source.week,
    day: source.day,
    kind: source.kind,
    sections,
    maxScore,
    snapshotAt: now.toISOString(),
  });
}

/** Bản cho học sinh: bỏ answerKey khỏi mọi câu */
export function stripAnswerKeys(snapshot: WorksheetSnapshot): StudentWorksheetView {
  return {
    ...snapshot,
    sections: snapshot.sections.map((s) => ({
      ...s,
      items: s.items.map((it) => {
        const { answerKey: _answerKey, ...question } = it.question;
        return { ...it, question };
      }),
    })),
  };
}

/** Item phẳng theo thứ tự Part → câu */
export function itemsOf(snapshot: Pick<WorksheetSnapshot, 'sections'>): SnapshotItem[] {
  return snapshot.sections.flatMap((s) => s.items);
}

/** Có câu chấm tay? */
export function hasManualItems(snapshot: Pick<WorksheetSnapshot, 'sections'>): boolean {
  return itemsOf(snapshot).some((it) => it.question.gradingMode === 'MANUAL');
}
