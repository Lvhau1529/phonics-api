import {
  QuestionAnswer,
  type QuestionAnswerKey,
  type QuestionConfig,
  type QuestionType,
  type SnapshotQuestion,
  gradingModeOf,
} from '@phonics/contracts';
import { clamp } from 'es-toolkit';
import {
  gradeCrossword,
  gradeFillBlank,
  gradeInlineChoice,
  gradeMissingSound,
  gradeMultipleChoice,
  gradeNumberPictures,
  gradeOddOneOut,
  gradePatternNext,
  gradePickLetters,
  gradeUnscrambleWord,
  gradeWordOrder,
  gradeWordSearch,
} from '@/modules/submissions/grading/graders';
import { type GradeResult, ZERO, round2 } from '@/modules/submissions/grading/types';

export { type GradeResult, round2 } from '@/modules/submissions/grading/types';
export * from '@/modules/submissions/grading/normalize';

type AnyGrader = (config: QuestionConfig, key: QuestionAnswerKey, answer: QuestionAnswer) => GradeResult;

/** Bảng chấm theo dạng; null = chấm tay (TRACE_AND_READ, SPEAK) */
const GRADERS: Record<QuestionType, AnyGrader | null> = {
  MISSING_SOUND: gradeMissingSound as AnyGrader,
  CROSSWORD: gradeCrossword as AnyGrader,
  UNSCRAMBLE_WORD: gradeUnscrambleWord as AnyGrader,
  PICK_LETTERS: gradePickLetters as AnyGrader,
  WORD_SEARCH: gradeWordSearch as AnyGrader,
  ODD_ONE_OUT: gradeOddOneOut as AnyGrader,
  PATTERN_NEXT: gradePatternNext as AnyGrader,
  NUMBER_PICTURES: gradeNumberPictures as AnyGrader,
  MULTIPLE_CHOICE: gradeMultipleChoice as AnyGrader,
  FILL_BLANK_WORD_BANK: gradeFillBlank as AnyGrader,
  WORD_ORDER: gradeWordOrder as AnyGrader,
  INLINE_CHOICE: gradeInlineChoice as AnyGrader,
  TRACE_AND_READ: null,
  SPEAK: null,
};

export const isAutoGraded = (type: QuestionType): boolean => gradingModeOf(type) === 'AUTO';

/**
 * Chấm một câu theo snapshot. Trả ZERO khi: dạng chấm tay, chưa trả lời, answer sai dạng / không parse được.
 * Hàm thuần — service gọi trong transaction submit, unit test không cần DB.
 */
export function gradeItem(
  question: Pick<SnapshotQuestion, 'type' | 'config' | 'answerKey'>,
  answer: unknown,
): GradeResult {
  const grader = GRADERS[question.type];
  if (!grader || answer == null) return ZERO;
  const parsed = QuestionAnswer.safeParse(answer);
  if (!parsed.success || parsed.data.type !== question.type) return ZERO;
  if (question.config.type !== question.type || question.answerKey.type !== question.type) return ZERO;
  const result = grader(question.config, question.answerKey, parsed.data);
  return { ...result, fraction: clamp(result.fraction, 0, 1) };
}

/** Điểm số của câu = fraction × điểm tối đa, làm tròn 2 chữ số */
export const scoreOf = (result: GradeResult, points: number): number => round2(result.fraction * points);
