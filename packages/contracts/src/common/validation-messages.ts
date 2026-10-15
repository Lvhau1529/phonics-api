/**
 * Message validate tự viết của schema (refine / regex / superRefine) — song ngữ vi / en (ADR 0025).
 * Schema chỉ đặt KHOÁ làm message (`.refine(fn, ValidationMessage.atLeastOneField)`), tham số nằm ở `issue.params`;
 * API và admin cùng dịch bằng `translateIssueMessage(issue, locale)`. Message mặc định của zod (min / max / type...)
 * không qua đây — mỗi app tự đặt `z.config({ localeError })` theo ngôn ngữ.
 * Thêm khoá: thêm vào `vi` (bộ nguồn) rồi `en` (kiểu `ValidationCatalog` bắt thiếu / sai tham số).
 */
import type { z } from 'zod';

const vi = {
  // ---------- Chung ----------
  atLeastOneField: 'Cần ít nhất một trường',
  atLeastOneChange: 'Cần ít nhất một thay đổi',
  sortFormat: 'sort phải có dạng field:asc|desc',
  phoneInvalid: 'Số điện thoại không hợp lệ',
  schoolYearFormat: 'Năm học dạng 2026-2027',
  dueAfterOpen: 'Hạn nộp phải sau thời điểm mở',
  correctNotAboveTotal: 'correct phải ≤ total',
  pointsNonZero: 'Điểm phải khác 0',
  mediaTypeUnsupported: 'Định dạng file không hỗ trợ',
  fileTooLarge: 'File quá lớn',

  // ---------- Câu hỏi: trường ----------
  letterOrDigraph: 'Chữ cái hoặc digraph (1-3 ký tự a-z)',
  patternFormat: 'Mẫu dạng m-a-_',
  lettersOnly: 'Chỉ chữ cái a-z (2-12 ký tự)',

  // ---------- Câu hỏi: kiểm tra chéo config ↔ answerKey ----------
  blankCountMismatch: 'Số chữ phải bằng số ô trống trong mẫu',
  duplicateNumberDirection: 'Số thứ tự + hướng bị trùng',
  wordOutOfGrid: 'Từ vượt ngoài lưới',
  wordNotInGrid: 'Không có từ tương ứng trong lưới',
  answerLength: (p: { length: number }) => `Đáp án phải dài ${p.length} chữ`,
  missingAnswers: 'Thiếu đáp án cho một số từ',
  answerUsesScrambledLetters: 'Đáp án phải dùng đúng các chữ đã xáo',
  duplicateLetterId: 'id chữ bị trùng',
  letterIdsDistinctInGrid: 'letterIds phải là các id khác nhau trong lưới',
  lettersMustFormWord: 'Các chữ chọn phải ghép thành từ',
  gridSizeMismatch: 'Lưới phải đúng rows × cols',
  placementMissing: (p: { word: string; index: number }) => `Thiếu vị trí cho từ "${p.word}" (#${p.index})`,
  duplicateOptionId: 'id lựa chọn bị trùng',
  answerNotInOptions: 'Đáp án không có trong lựa chọn',
  wordRequired: 'Cần từ đúng khi bật viết từ',
  duplicateNumber: 'Số thứ tự bị trùng',
  duplicateImageId: 'id ảnh bị trùng',
  oneNumberPerImage: 'Mỗi ảnh phải có đúng một số',
  numberUsedOnce: 'Mỗi số chỉ gán cho một ảnh và phải có trong danh sách từ',
  duplicateSentenceId: 'id câu bị trùng',
  sentenceNeedsBlank: (p: { token: string }) => `Câu phải có ít nhất một ${p.token}`,
  oneAnswerPerBlank: 'Mỗi chỗ trống phải có đúng một đáp án',
  answerNotInWordBank: 'Đáp án phải nằm trong word bank',
  notPermutation: 'Phải là hoán vị của các thẻ từ',
  duplicateBlankId: 'id chỗ trống bị trùng',
  passageMissingPlaceholder: (p: { placeholder: string }) => `Đoạn văn thiếu ${p.placeholder}`,
  unknownBlank: 'Không có chỗ trống này',
  pickNotInOptions: 'Đáp án phải là một trong các lựa chọn',
  tracePartNotInSentence: 'Phần tô phải nằm trong câu',
  traceOrRecordRequired: 'Cần tô hoặc ghi âm',
  configTypeMismatch: 'config.type phải trùng type',
  answerKeyTypeMismatch: 'answerKey.type phải trùng type',
  configAnswerKeyTogether: 'config và answerKey phải gửi cùng nhau',
  answerKeyConfigTypeMismatch: 'answerKey.type phải trùng config.type',
};

export type ValidationCatalog = typeof vi;
export type ValidationMessageKey = keyof ValidationCatalog;

const en: ValidationCatalog = {
  atLeastOneField: 'At least one field is required',
  atLeastOneChange: 'At least one change is required',
  sortFormat: 'sort must look like field:asc|desc',
  phoneInvalid: 'Invalid phone number',
  schoolYearFormat: 'School year must look like 2026-2027',
  dueAfterOpen: 'The due date must be after the open time',
  correctNotAboveTotal: 'correct must be ≤ total',
  pointsNonZero: 'Points must not be 0',
  mediaTypeUnsupported: 'Unsupported file type',
  fileTooLarge: 'File is too large',

  letterOrDigraph: 'A letter or digraph (1-3 letters a-z)',
  patternFormat: 'Pattern must look like m-a-_',
  lettersOnly: 'Letters a-z only (2-12 characters)',

  blankCountMismatch: 'The number of letters must equal the number of blanks in the pattern',
  duplicateNumberDirection: 'Duplicate number + direction',
  wordOutOfGrid: 'The word goes outside the grid',
  wordNotInGrid: 'No matching word in the grid',
  answerLength: (p) => `The answer must be ${p.length} letters long`,
  missingAnswers: 'Some words have no answer',
  answerUsesScrambledLetters: 'The answer must use exactly the scrambled letters',
  duplicateLetterId: 'Duplicate letter id',
  letterIdsDistinctInGrid: 'letterIds must be distinct ids from the grid',
  lettersMustFormWord: 'The chosen letters must spell the word',
  gridSizeMismatch: 'The grid must be exactly rows × cols',
  placementMissing: (p) => `Missing placement for "${p.word}" (#${p.index})`,
  duplicateOptionId: 'Duplicate option id',
  answerNotInOptions: 'The answer is not one of the options',
  wordRequired: 'The correct word is required when word writing is on',
  duplicateNumber: 'Duplicate number',
  duplicateImageId: 'Duplicate image id',
  oneNumberPerImage: 'Each picture must have exactly one number',
  numberUsedOnce: 'Each number goes to one picture only and must be in the word list',
  duplicateSentenceId: 'Duplicate sentence id',
  sentenceNeedsBlank: (p) => `The sentence needs at least one ${p.token}`,
  oneAnswerPerBlank: 'Each blank must have exactly one answer',
  answerNotInWordBank: 'The answer must be in the word bank',
  notPermutation: 'Must be a reordering of the word cards',
  duplicateBlankId: 'Duplicate blank id',
  passageMissingPlaceholder: (p) => `The passage is missing ${p.placeholder}`,
  unknownBlank: 'This blank does not exist',
  pickNotInOptions: 'The answer must be one of the choices',
  tracePartNotInSentence: 'The traced part must be in the sentence',
  traceOrRecordRequired: 'Turn on tracing or recording',
  configTypeMismatch: 'config.type must match type',
  answerKeyTypeMismatch: 'answerKey.type must match type',
  configAnswerKeyTogether: 'config and answerKey must be sent together',
  answerKeyConfigTypeMismatch: 'answerKey.type must match config.type',
};

export const VALIDATION_LOCALES = ['vi', 'en'] as const;
export type ValidationLocale = (typeof VALIDATION_LOCALES)[number];

export const VALIDATION_MESSAGES: Record<ValidationLocale, ValidationCatalog> = { vi, en };

/** Khoá dùng làm message trong schema: `ValidationMessage.atLeastOneField` === 'atLeastOneField' */
export const ValidationMessage = Object.fromEntries(Object.keys(vi).map((key) => [key, key])) as {
  readonly [K in ValidationMessageKey]: K;
};

/** Tham số của khoá (rỗng nếu khoá không có tham số) — dùng cho helper thêm issue có kiểm kiểu */
export type ValidationParamsArgs<K extends ValidationMessageKey> = ValidationCatalog[K] extends (
  params: infer P,
) => string
  ? [params: P]
  : [];

export const isValidationMessageKey = (message: string): message is ValidationMessageKey =>
  Object.prototype.hasOwnProperty.call(vi, message);

/** Thêm issue `custom` với message là khoá (tham số vào `params`), kiểm kiểu khoá + tham số */
export function addValidationIssue<K extends ValidationMessageKey>(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  key: K,
  ...params: ValidationParamsArgs<K>
): void {
  const [p] = params as [Record<string, unknown>?];
  ctx.addIssue(
    p ? { code: 'custom', path, message: key, params: p } : { code: 'custom', path, message: key },
  );
}

/**
 * Message hiển thị của một issue zod theo ngôn ngữ: message là khoá → câu đã dịch (tham số lấy từ
 * `issue.params`); còn lại (message mặc định của zod, đã theo `localeError`) → giữ nguyên.
 */
export function translateIssueMessage(
  issue: { message: string; params?: unknown },
  locale: ValidationLocale,
): string {
  if (!isValidationMessageKey(issue.message)) return issue.message;
  const entry = VALIDATION_MESSAGES[locale][issue.message];
  return typeof entry === 'function' ? entry((issue.params ?? {}) as never) : entry;
}
