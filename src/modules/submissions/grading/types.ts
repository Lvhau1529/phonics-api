import { type QuestionAnswer, type QuestionAnswerKey, type QuestionConfig } from '@phonics/contracts';
import { round } from 'es-toolkit';

/** Kết quả chấm một câu: tỉ lệ đúng [0, 1], đúng hoàn toàn hay không, chi tiết từng phần để client tô màu */
export interface GradeResult {
  fraction: number;
  correct: boolean;
  detail: Record<string, unknown>;
}

export type Grader<C extends QuestionConfig, K extends QuestionAnswerKey, A extends QuestionAnswer> = (
  config: C,
  key: K,
  answer: A,
) => GradeResult;

export const ZERO: GradeResult = { fraction: 0, correct: false, detail: {} };

/** Làm tròn 2 chữ số (điểm một phần: 3/5 từ × 1 điểm = 0.6) */
export const round2 = (n: number): number => round(n, 2);

export const ratio = (correct: number, total: number): number => (total > 0 ? correct / total : 0);
