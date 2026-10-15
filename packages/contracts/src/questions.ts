import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { addValidationIssue, ValidationMessage } from './common/validation-messages.js';
import { MediaMap, MediaRef } from './media.js';

/**
 * Ngân hàng câu hỏi (ADR 0017). 14 dạng rút từ phiếu bài tập giấy (Grade K, Phonics / ESL).
 * Mỗi dạng có 3 schema: `XConfig` (học sinh thấy), `XAnswerKey` (giáo viên nhập, không trả cho học sinh),
 * `XAnswer` (học sinh gửi). Cả ba có `type` literal để gom thành discriminated union.
 * Media trong JSON tham chiếu bằng khoá `*MediaId` / `*MediaIds` / `mediaId` (xem media.ts).
 */
export const QuestionType = z.enum([
  'MISSING_SOUND',
  'CROSSWORD',
  'UNSCRAMBLE_WORD',
  'PICK_LETTERS',
  'WORD_SEARCH',
  'ODD_ONE_OUT',
  'PATTERN_NEXT',
  'NUMBER_PICTURES',
  'MULTIPLE_CHOICE',
  'FILL_BLANK_WORD_BANK',
  'WORD_ORDER',
  'INLINE_CHOICE',
  'TRACE_AND_READ',
  'SPEAK',
]);
export type QuestionType = z.infer<typeof QuestionType>;
export const QUESTION_TYPES: readonly QuestionType[] = QuestionType.options;

export const GradingMode = z.enum(['AUTO', 'MANUAL']);
export type GradingMode = z.infer<typeof GradingMode>;

/** Dạng giáo viên chấm tay (ghi âm / tô chữ) */
export const MANUAL_TYPES: readonly QuestionType[] = ['TRACE_AND_READ', 'SPEAK'];
export const gradingModeOf = (type: QuestionType): GradingMode =>
  MANUAL_TYPES.includes(type) ? 'MANUAL' : 'AUTO';

export const ContentStatus = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export type ContentStatus = z.infer<typeof ContentStatus>;

/** PRIVATE: chỉ người tạo (và admin) thấy; SHARED: giáo viên khác dùng được bản PUBLISHED */
export const Visibility = z.enum(['PRIVATE', 'SHARED']);
export type Visibility = z.infer<typeof Visibility>;

// ---------- nguyên tử dùng chung ----------
const MediaId = Id;
export const Word = z.string().trim().min(1).max(40);
/** Một chữ cái hoặc digraph (sh, ch, ck, qu) */
export const Letter = z
  .string()
  .trim()
  .regex(/^[a-z]{1,3}$/i, ValidationMessage.letterOrDigraph);
export const OptionId = z.string().trim().min(1).max(20);
export const Cell = z.object({ r: z.int().min(0).max(14), c: z.int().min(0).max(14) });
export type Cell = z.infer<typeof Cell>;
export const Direction = z.enum(['across', 'down']);
export type Direction = z.infer<typeof Direction>;
export const Tag = z.string().trim().min(1).max(30);

const lower = (s: string) => s.trim().toLowerCase();
const sortedLetters = (s: string) =>
  lower(s)
    .replace(/[^a-z]/g, '')
    .split('')
    .sort()
    .join('');
const uniqueBy = <T>(arr: readonly T[], key: (t: T) => string): boolean =>
  new Set(arr.map(key)).size === arr.length;

// ---------- 1. MISSING_SOUND ----------
/** Mẫu `m-a-_`: chữ hiện sẵn, `_` là ô trống (có thể nhiều ô), `-` chỉ để hiển thị */
export const MissingSoundPattern = z
  .string()
  .trim()
  .regex(/^[a-z_]+(-[a-z_]+)*$/i, ValidationMessage.patternFormat)
  .max(30);
export const blankCount = (pattern: string): number => (pattern.match(/_/g) ?? []).length;

export const MissingSoundConfig = z.object({
  type: z.literal('MISSING_SOUND'),
  imageMediaId: MediaId,
  audioMediaId: MediaId.optional(),
  pattern: MissingSoundPattern,
});
export const MissingSoundAnswerKey = z.object({
  type: z.literal('MISSING_SOUND'),
  /** Một phần tử cho mỗi `_` theo thứ tự */
  letters: z.array(Letter).min(1).max(10),
  word: Word,
});
export const MissingSoundAnswer = z.object({
  type: z.literal('MISSING_SOUND'),
  letters: z.array(z.string().trim().max(3)).max(10),
  word: z.string().trim().max(40),
});

// ---------- 2. CROSSWORD ----------
export const CrosswordConfig = z.object({
  type: z.literal('CROSSWORD'),
  rows: z.int().min(2).max(12),
  cols: z.int().min(2).max(12),
  words: z
    .array(
      z.object({
        number: z.int().min(1).max(30),
        direction: Direction,
        start: Cell,
        length: z.int().min(2).max(12),
        /** Ảnh gợi ý */
        clueMediaId: MediaId,
      }),
    )
    .min(1)
    .max(12),
  /** Ô cho sẵn chữ */
  prefilled: z
    .array(
      Cell.extend({
        letter: z
          .string()
          .trim()
          .regex(/^[a-z]$/i),
      }),
    )
    .max(50)
    .default([]),
});
export const CrosswordAnswerKey = z.object({
  type: z.literal('CROSSWORD'),
  words: z
    .array(z.object({ number: z.int().min(1).max(30), direction: Direction, answer: Word }))
    .min(1)
    .max(12),
});
export const CrosswordAnswer = z.object({
  type: z.literal('CROSSWORD'),
  cells: z.array(Cell.extend({ letter: z.string().trim().max(1) })).max(144),
});

// ---------- 3. UNSCRAMBLE_WORD ----------
export const UnscrambleWordConfig = z.object({
  type: z.literal('UNSCRAMBLE_WORD'),
  imageMediaId: MediaId,
  /** Chữ đã xáo, chỉ a-z */
  scrambled: z
    .string()
    .trim()
    .regex(/^[a-z]{2,12}$/i, ValidationMessage.lettersOnly),
});
export const UnscrambleWordAnswerKey = z.object({
  type: z.literal('UNSCRAMBLE_WORD'),
  word: Word,
  /** Đáp án khác cũng chấp nhận (vd "tac" cho c-a-t) */
  accepted: z.array(Word).max(5).default([]),
});
export const UnscrambleWordAnswer = z.object({
  type: z.literal('UNSCRAMBLE_WORD'),
  word: z.string().trim().max(40),
});

// ---------- 4. PICK_LETTERS ----------
export const PickLettersConfig = z.object({
  type: z.literal('PICK_LETTERS'),
  imageMediaId: MediaId,
  letters: z
    .array(z.object({ id: OptionId, letter: Letter }))
    .min(4)
    .max(9),
});
export const PickLettersAnswerKey = z.object({
  type: z.literal('PICK_LETTERS'),
  /** Theo thứ tự ghép thành từ */
  letterIds: z.array(OptionId).min(1).max(9),
  word: Word,
});
export const PickLettersAnswer = z.object({
  type: z.literal('PICK_LETTERS'),
  letterIds: z.array(OptionId).max(9),
  word: z.string().trim().max(40),
});

// ---------- 5. WORD_SEARCH ----------
export const WordSearchConfig = z.object({
  type: z.literal('WORD_SEARCH'),
  rows: z.int().min(3).max(12),
  cols: z.int().min(3).max(12),
  /** Mỗi phần tử là một hàng, đúng `cols` chữ cái */
  grid: z
    .array(z.string().regex(/^[a-z]+$/i))
    .min(3)
    .max(12),
  words: z
    .array(z.object({ word: Word, imageMediaId: MediaId.optional() }))
    .min(1)
    .max(10),
});
export const WordSearchAnswerKey = z.object({
  type: z.literal('WORD_SEARCH'),
  placements: z
    .array(z.object({ word: Word, start: Cell, end: Cell }))
    .min(1)
    .max(10),
});
export const WordSearchAnswer = z.object({
  type: z.literal('WORD_SEARCH'),
  found: z.array(z.object({ word: z.string().trim().max(40), start: Cell, end: Cell })).max(10),
});

// ---------- 6. ODD_ONE_OUT ----------
export const OddOneOutConfig = z.object({
  type: z.literal('ODD_ONE_OUT'),
  options: z
    .array(z.object({ id: OptionId, mediaId: MediaId, label: Word.optional() }))
    .min(3)
    .max(6),
});
export const OddOneOutAnswerKey = z.object({ type: z.literal('ODD_ONE_OUT'), optionId: OptionId });
export const OddOneOutAnswer = z.object({ type: z.literal('ODD_ONE_OUT'), optionId: OptionId.nullable() });

// ---------- 7. PATTERN_NEXT ----------
export const PatternNextConfig = z.object({
  type: z.literal('PATTERN_NEXT'),
  /** Chuỗi ảnh lặp theo quy luật, kết thúc bằng "?" */
  sequence: z.array(MediaId).min(3).max(10),
  options: z
    .array(z.object({ id: OptionId, mediaId: MediaId, word: Word.optional() }))
    .min(2)
    .max(4),
  /** Sau khi chọn ảnh, viết từ */
  requireWord: z.boolean().default(false),
});
export const PatternNextAnswerKey = z.object({
  type: z.literal('PATTERN_NEXT'),
  optionId: OptionId,
  word: Word.optional(),
});
export const PatternNextAnswer = z.object({
  type: z.literal('PATTERN_NEXT'),
  optionId: OptionId.nullable(),
  word: z.string().trim().max(40).optional(),
});

// ---------- 8. NUMBER_PICTURES ----------
export const NumberPicturesConfig = z.object({
  type: z.literal('NUMBER_PICTURES'),
  /** Danh sách từ đánh số (1. moon, 2. milk…) */
  words: z
    .array(z.object({ number: z.int().min(1).max(20), word: Word }))
    .min(2)
    .max(12),
  images: z
    .array(z.object({ id: OptionId, mediaId: MediaId }))
    .min(2)
    .max(12),
  /** Có audio → "Listen and number the pictures" */
  audioMediaId: MediaId.optional(),
  /** Sau khi đánh số, viết từ dưới mỗi ảnh (chấm 50/50) */
  writeWord: z.boolean().default(false),
  /** Hiện word bank cho học sinh (ẩn khi muốn bé tự nghe) */
  showWordBank: z.boolean().default(true),
});
export const NumberPicturesAnswerKey = z.object({
  type: z.literal('NUMBER_PICTURES'),
  numbers: z
    .array(z.object({ imageId: OptionId, number: z.int().min(1).max(20) }))
    .min(2)
    .max(12),
});
export const NumberPicturesAnswer = z.object({
  type: z.literal('NUMBER_PICTURES'),
  numbers: z.array(z.object({ imageId: OptionId, number: z.int().min(1).max(20).nullable() })).max(12),
  words: z
    .array(z.object({ imageId: OptionId, word: z.string().trim().max(40) }))
    .max(12)
    .optional(),
});

// ---------- 9. MULTIPLE_CHOICE ----------
export const MultipleChoiceConfig = z.object({
  type: z.literal('MULTIPLE_CHOICE'),
  imageMediaId: MediaId.optional(),
  /** Câu dẫn tuỳ chọn (khi lựa chọn là từ) */
  prompt: z.string().trim().max(200).optional(),
  /** Từ hoặc cả câu ("Nat and Tip see the children.") */
  options: z
    .array(z.object({ id: OptionId, text: z.string().trim().min(1).max(120) }))
    .min(2)
    .max(4),
});
export const MultipleChoiceAnswerKey = z.object({ type: z.literal('MULTIPLE_CHOICE'), optionId: OptionId });
export const MultipleChoiceAnswer = z.object({
  type: z.literal('MULTIPLE_CHOICE'),
  optionId: OptionId.nullable(),
});

// ---------- 10. FILL_BLANK_WORD_BANK ----------
/** Chỗ trống trong câu */
export const BLANK_TOKEN = '___';
export const countBlanks = (text: string): number => text.split(BLANK_TOKEN).length - 1;

export const FillBlankConfig = z.object({
  type: z.literal('FILL_BLANK_WORD_BANK'),
  wordBank: z.array(Word).min(2).max(12),
  sentences: z
    .array(
      z.object({
        id: OptionId,
        /** Có ít nhất một `___` */
        text: z.string().trim().min(1).max(200),
        imageMediaId: MediaId.optional(),
      }),
    )
    .min(1)
    .max(10),
});
export const FillBlankAnswerKey = z.object({
  type: z.literal('FILL_BLANK_WORD_BANK'),
  blanks: z
    .array(z.object({ sentenceId: OptionId, index: z.int().min(0).max(9), word: Word }))
    .min(1)
    .max(30),
});
export const FillBlankAnswer = z.object({
  type: z.literal('FILL_BLANK_WORD_BANK'),
  blanks: z
    .array(z.object({ sentenceId: OptionId, index: z.int().min(0).max(9), word: z.string().trim().max(40) }))
    .max(30),
});

// ---------- 11. WORD_ORDER ----------
export const WordOrderConfig = z.object({
  type: z.literal('WORD_ORDER'),
  imageMediaId: MediaId.optional(),
  /** Thẻ từ đã xáo (có thể trùng từ → so bằng index) */
  words: z.array(z.string().trim().min(1).max(30)).min(2).max(15),
  endPunctuation: z.enum(['.', '?', '!']).optional(),
});
export const WordOrderAnswerKey = z.object({
  type: z.literal('WORD_ORDER'),
  /** Mỗi phương án là hoán vị index của `words`; cho phép nhiều trật tự đúng */
  accepted: z
    .array(z.array(z.int().min(0).max(14)).min(2).max(15))
    .min(1)
    .max(5),
});
export const WordOrderAnswer = z.object({
  type: z.literal('WORD_ORDER'),
  order: z.array(z.int().min(0).max(14)).max(15),
});

// ---------- 12. INLINE_CHOICE ----------
/** Chỗ trống trong đoạn văn viết dạng `{{b1}}` */
export const inlinePlaceholder = (blankId: string): string => `{{${blankId}}}`;

export const InlineChoiceConfig = z.object({
  type: z.literal('INLINE_CHOICE'),
  /** Dải ảnh kể chuyện (tuỳ chọn) */
  imageMediaIds: z.array(MediaId).max(6).default([]),
  /** Đoạn văn có `{{blankId}}` */
  text: z.string().trim().min(1).max(1000),
  blanks: z
    .array(z.object({ id: OptionId, options: z.array(z.string().trim().min(1).max(40)).min(2).max(4) }))
    .min(1)
    .max(15),
});
export const InlineChoiceAnswerKey = z.object({
  type: z.literal('INLINE_CHOICE'),
  picks: z
    .array(z.object({ blankId: OptionId, option: z.string().trim().min(1).max(40) }))
    .min(1)
    .max(15),
});
export const InlineChoiceAnswer = z.object({
  type: z.literal('INLINE_CHOICE'),
  picks: z.array(z.object({ blankId: OptionId, option: z.string().trim().max(40).nullable() })).max(15),
});

// ---------- 13. TRACE_AND_READ (MANUAL) ----------
export const TraceAndReadConfig = z.object({
  type: z.literal('TRACE_AND_READ'),
  /** Câu đầy đủ: "We like to run." */
  sentence: z.string().trim().min(1).max(200),
  /** Phần tô (chữ chấm), phải nằm trong `sentence` */
  tracePart: z.string().trim().min(1).max(100),
  imageMediaId: MediaId.optional(),
  modelAudioMediaId: MediaId.optional(),
  requireTrace: z.boolean().default(true),
  requireRecording: z.boolean().default(true),
});
export const TraceAndReadAnswerKey = z.object({
  type: z.literal('TRACE_AND_READ'),
  /** Gợi ý chấm cho giáo viên */
  rubric: z.string().trim().max(500).optional(),
});
export const TraceAndReadAnswer = z.object({
  type: z.literal('TRACE_AND_READ'),
  /** PNG canvas (IMAGE, owner = học sinh) */
  traceMediaId: MediaId.optional(),
  /** Ghi âm đọc (AUDIO, owner = học sinh) */
  recordingMediaId: MediaId.optional(),
});

// ---------- 14. SPEAK (MANUAL) ----------
export const SpeakConfig = z.object({
  type: z.literal('SPEAK'),
  prompt: z.string().trim().min(1).max(120),
  imageMediaId: MediaId.optional(),
  modelAudioMediaId: MediaId.optional(),
});
export const SpeakAnswerKey = z.object({
  type: z.literal('SPEAK'),
  rubric: z.string().trim().max(500).optional(),
});
export const SpeakAnswer = z.object({ type: z.literal('SPEAK'), recordingMediaId: MediaId.optional() });

// ---------- Union ----------
export const QuestionConfig = z.discriminatedUnion('type', [
  MissingSoundConfig,
  CrosswordConfig,
  UnscrambleWordConfig,
  PickLettersConfig,
  WordSearchConfig,
  OddOneOutConfig,
  PatternNextConfig,
  NumberPicturesConfig,
  MultipleChoiceConfig,
  FillBlankConfig,
  WordOrderConfig,
  InlineChoiceConfig,
  TraceAndReadConfig,
  SpeakConfig,
]);
export type QuestionConfig = z.infer<typeof QuestionConfig>;

export const QuestionAnswerKey = z.discriminatedUnion('type', [
  MissingSoundAnswerKey,
  CrosswordAnswerKey,
  UnscrambleWordAnswerKey,
  PickLettersAnswerKey,
  WordSearchAnswerKey,
  OddOneOutAnswerKey,
  PatternNextAnswerKey,
  NumberPicturesAnswerKey,
  MultipleChoiceAnswerKey,
  FillBlankAnswerKey,
  WordOrderAnswerKey,
  InlineChoiceAnswerKey,
  TraceAndReadAnswerKey,
  SpeakAnswerKey,
]);
export type QuestionAnswerKey = z.infer<typeof QuestionAnswerKey>;

export const QuestionAnswer = z.discriminatedUnion('type', [
  MissingSoundAnswer,
  CrosswordAnswer,
  UnscrambleWordAnswer,
  PickLettersAnswer,
  WordSearchAnswer,
  OddOneOutAnswer,
  PatternNextAnswer,
  NumberPicturesAnswer,
  MultipleChoiceAnswer,
  FillBlankAnswer,
  WordOrderAnswer,
  InlineChoiceAnswer,
  TraceAndReadAnswer,
  SpeakAnswer,
]);
export type QuestionAnswer = z.infer<typeof QuestionAnswer>;

export type ConfigOf<T extends QuestionType> = Extract<QuestionConfig, { type: T }>;
export type AnswerKeyOf<T extends QuestionType> = Extract<QuestionAnswerKey, { type: T }>;
export type AnswerOf<T extends QuestionType> = Extract<QuestionAnswer, { type: T }>;

// ---------- Kiểm tra chéo config ↔ answerKey ----------
type Ctx = z.RefinementCtx;
/** Issue custom với message là khoá (`common/validation-messages.ts`), có kiểm kiểu tham số */
const issue = addValidationIssue;

const pair = <T extends QuestionType, C, K>(
  type: T,
  config: z.ZodType<C>,
  answerKey: z.ZodType<K>,
  check: (c: C, k: K, ctx: Ctx) => void,
) =>
  z
    .object({ type: z.literal(type), config, answerKey })
    .superRefine((v, ctx) => check(v.config, v.answerKey, ctx));

/** config + answerKey cùng type, kèm ràng buộc nghiệp vụ giữa hai bên */
export const QuestionContent = z.discriminatedUnion('type', [
  pair('MISSING_SOUND', MissingSoundConfig, MissingSoundAnswerKey, (c, k, ctx) => {
    if (blankCount(c.pattern) !== k.letters.length)
      issue(ctx, ['answerKey', 'letters'], 'blankCountMismatch');
  }),
  pair('CROSSWORD', CrosswordConfig, CrosswordAnswerKey, (c, k, ctx) => {
    if (!uniqueBy(c.words, (w) => `${w.number}:${w.direction}`))
      issue(ctx, ['config', 'words'], 'duplicateNumberDirection');
    c.words.forEach((w, i) => {
      const endR = w.direction === Direction.enum.down ? w.start.r + w.length - 1 : w.start.r;
      const endC = w.direction === Direction.enum.across ? w.start.c + w.length - 1 : w.start.c;
      if (endR >= c.rows || endC >= c.cols) issue(ctx, ['config', 'words', i], 'wordOutOfGrid');
    });
    k.words.forEach((kw, i) => {
      const cw = c.words.find((w) => w.number === kw.number && w.direction === kw.direction);
      if (!cw) issue(ctx, ['answerKey', 'words', i], 'wordNotInGrid');
      else if (lower(kw.answer).length !== cw.length)
        issue(ctx, ['answerKey', 'words', i, 'answer'], 'answerLength', { length: cw.length });
    });
    if (k.words.length !== c.words.length) issue(ctx, ['answerKey', 'words'], 'missingAnswers');
  }),
  pair('UNSCRAMBLE_WORD', UnscrambleWordConfig, UnscrambleWordAnswerKey, (c, k, ctx) => {
    if (sortedLetters(k.word) !== sortedLetters(c.scrambled))
      issue(ctx, ['answerKey', 'word'], 'answerUsesScrambledLetters');
  }),
  pair('PICK_LETTERS', PickLettersConfig, PickLettersAnswerKey, (c, k, ctx) => {
    if (!uniqueBy(c.letters, (l) => l.id)) issue(ctx, ['config', 'letters'], 'duplicateLetterId');
    const byId = new Map(c.letters.map((l) => [l.id, l.letter]));
    if (!uniqueBy(k.letterIds, (id) => id) || k.letterIds.some((id) => !byId.has(id)))
      issue(ctx, ['answerKey', 'letterIds'], 'letterIdsDistinctInGrid');
    else if (lower(k.letterIds.map((id) => byId.get(id) ?? '').join('')) !== lower(k.word))
      issue(ctx, ['answerKey', 'word'], 'lettersMustFormWord');
  }),
  pair('WORD_SEARCH', WordSearchConfig, WordSearchAnswerKey, (c, k, ctx) => {
    if (c.grid.length !== c.rows || c.grid.some((row) => row.length !== c.cols))
      issue(ctx, ['config', 'grid'], 'gridSizeMismatch');
    const placed = new Set(k.placements.map((p) => lower(p.word)));
    c.words.forEach((w, i) => {
      if (!placed.has(lower(w.word)))
        issue(ctx, ['answerKey', 'placements'], 'placementMissing', { word: w.word, index: i + 1 });
    });
  }),
  pair('ODD_ONE_OUT', OddOneOutConfig, OddOneOutAnswerKey, (c, k, ctx) => {
    if (!uniqueBy(c.options, (o) => o.id)) issue(ctx, ['config', 'options'], 'duplicateOptionId');
    if (!c.options.some((o) => o.id === k.optionId))
      issue(ctx, ['answerKey', 'optionId'], 'answerNotInOptions');
  }),
  pair('PATTERN_NEXT', PatternNextConfig, PatternNextAnswerKey, (c, k, ctx) => {
    if (!uniqueBy(c.options, (o) => o.id)) issue(ctx, ['config', 'options'], 'duplicateOptionId');
    if (!c.options.some((o) => o.id === k.optionId))
      issue(ctx, ['answerKey', 'optionId'], 'answerNotInOptions');
    if (c.requireWord && !k.word) issue(ctx, ['answerKey', 'word'], 'wordRequired');
  }),
  pair('NUMBER_PICTURES', NumberPicturesConfig, NumberPicturesAnswerKey, (c, k, ctx) => {
    if (!uniqueBy(c.words, (w) => String(w.number))) issue(ctx, ['config', 'words'], 'duplicateNumber');
    if (!uniqueBy(c.images, (im) => im.id)) issue(ctx, ['config', 'images'], 'duplicateImageId');
    const numbers = new Set(c.words.map((w) => w.number));
    const imageIds = new Set(c.images.map((im) => im.id));
    if (
      k.numbers.length !== c.images.length ||
      !uniqueBy(k.numbers, (n) => n.imageId) ||
      k.numbers.some((n) => !imageIds.has(n.imageId))
    )
      issue(ctx, ['answerKey', 'numbers'], 'oneNumberPerImage');
    if (!uniqueBy(k.numbers, (n) => String(n.number)) || k.numbers.some((n) => !numbers.has(n.number)))
      issue(ctx, ['answerKey', 'numbers'], 'numberUsedOnce');
  }),
  pair('MULTIPLE_CHOICE', MultipleChoiceConfig, MultipleChoiceAnswerKey, (c, k, ctx) => {
    if (!uniqueBy(c.options, (o) => o.id)) issue(ctx, ['config', 'options'], 'duplicateOptionId');
    if (!c.options.some((o) => o.id === k.optionId))
      issue(ctx, ['answerKey', 'optionId'], 'answerNotInOptions');
  }),
  pair('FILL_BLANK_WORD_BANK', FillBlankConfig, FillBlankAnswerKey, (c, k, ctx) => {
    if (!uniqueBy(c.sentences, (s) => s.id)) issue(ctx, ['config', 'sentences'], 'duplicateSentenceId');
    const bank = new Set(c.wordBank.map(lower));
    const expected = new Set<string>();
    c.sentences.forEach((s, i) => {
      const n = countBlanks(s.text);
      if (n === 0)
        issue(ctx, ['config', 'sentences', i, 'text'], 'sentenceNeedsBlank', { token: BLANK_TOKEN });
      for (let b = 0; b < n; b++) expected.add(`${s.id}:${b}`);
    });
    const got = new Set(k.blanks.map((b) => `${b.sentenceId}:${b.index}`));
    if (got.size !== k.blanks.length || got.size !== expected.size || [...expected].some((e) => !got.has(e)))
      issue(ctx, ['answerKey', 'blanks'], 'oneAnswerPerBlank');
    k.blanks.forEach((b, i) => {
      if (!bank.has(lower(b.word))) issue(ctx, ['answerKey', 'blanks', i, 'word'], 'answerNotInWordBank');
    });
  }),
  pair('WORD_ORDER', WordOrderConfig, WordOrderAnswerKey, (c, k, ctx) => {
    const n = c.words.length;
    k.accepted.forEach((order, i) => {
      const ok = order.length === n && new Set(order).size === n && order.every((idx) => idx < n);
      if (!ok) issue(ctx, ['answerKey', 'accepted', i], 'notPermutation');
    });
  }),
  pair('INLINE_CHOICE', InlineChoiceConfig, InlineChoiceAnswerKey, (c, k, ctx) => {
    if (!uniqueBy(c.blanks, (b) => b.id)) issue(ctx, ['config', 'blanks'], 'duplicateBlankId');
    c.blanks.forEach((b, i) => {
      if (!c.text.includes(inlinePlaceholder(b.id)))
        issue(ctx, ['config', 'blanks', i], 'passageMissingPlaceholder', {
          placeholder: inlinePlaceholder(b.id),
        });
    });
    const byId = new Map(c.blanks.map((b) => [b.id, b.options]));
    if (k.picks.length !== c.blanks.length || !uniqueBy(k.picks, (p) => p.blankId))
      issue(ctx, ['answerKey', 'picks'], 'oneAnswerPerBlank');
    k.picks.forEach((p, i) => {
      const opts = byId.get(p.blankId);
      if (!opts) issue(ctx, ['answerKey', 'picks', i, 'blankId'], 'unknownBlank');
      else if (!opts.includes(p.option)) issue(ctx, ['answerKey', 'picks', i, 'option'], 'pickNotInOptions');
    });
  }),
  pair('TRACE_AND_READ', TraceAndReadConfig, TraceAndReadAnswerKey, (c, _k, ctx) => {
    if (!c.sentence.includes(c.tracePart)) issue(ctx, ['config', 'tracePart'], 'tracePartNotInSentence');
    if (!c.requireTrace && !c.requireRecording)
      issue(ctx, ['config', 'requireTrace'], 'traceOrRecordRequired');
  }),
  pair('SPEAK', SpeakConfig, SpeakAnswerKey, () => undefined),
]);
export type QuestionContent = z.infer<typeof QuestionContent>;

// ---------- Body / View ----------
/** Ví dụ mẫu "E.g." hiện trước câu hỏi */
export const QuestionExample = z.object({
  text: z.string().trim().min(1).max(200),
  imageMediaId: MediaId.optional(),
});
export type QuestionExample = z.infer<typeof QuestionExample>;

export const Instruction = z.string().trim().min(1).max(300);
export const Points = z.int().min(1).max(100);

const QuestionFields = z.strictObject({
  type: QuestionType,
  /** Hướng dẫn tiếng Anh ngắn hiện cho học sinh ("Look at the picture. Unscramble the word.") */
  instruction: Instruction,
  /** Ghi chú tiếng Việt cho giáo viên (tuỳ chọn) */
  instructionVi: z.string().trim().max(300).optional(),
  points: Points.default(1),
  /** vd "Nn", "grade-k", "week-9" */
  tags: z.array(Tag).max(10).default([]),
  example: QuestionExample.optional(),
  config: QuestionConfig,
  answerKey: QuestionAnswerKey,
  visibility: Visibility.default('SHARED'),
});

const checkContent = (
  v: { type: QuestionType; config: QuestionConfig; answerKey: QuestionAnswerKey },
  ctx: Ctx,
): void => {
  if (v.config.type !== v.type) issue(ctx, ['config', 'type'], 'configTypeMismatch');
  if (v.answerKey.type !== v.type) issue(ctx, ['answerKey', 'type'], 'answerKeyTypeMismatch');
  if (v.config.type !== v.type || v.answerKey.type !== v.type) return;
  const r = QuestionContent.safeParse({ type: v.type, config: v.config, answerKey: v.answerKey });
  // Giữ nguyên khoá + params của issue con (client / API dịch sau)
  if (!r.success)
    for (const i of r.error.issues) {
      const params = (i as { params?: Record<string, unknown> }).params;
      ctx.addIssue({
        code: 'custom',
        path: i.path as (string | number)[],
        message: i.message,
        ...(params && { params }),
      });
    }
};

export const CreateQuestionBody = QuestionFields.superRefine(checkContent);
export type CreateQuestionBody = z.infer<typeof CreateQuestionBody>;

/** Không đổi được `type`; sửa nội dung thì gửi cả `config` lẫn `answerKey` (API kiểm chéo theo type đã lưu) */
export const UpdateQuestionBody = z
  .strictObject({
    instruction: Instruction,
    instructionVi: z.string().trim().max(300).nullable(),
    points: Points,
    tags: z.array(Tag).max(10),
    example: QuestionExample.nullable(),
    config: QuestionConfig,
    answerKey: QuestionAnswerKey,
    visibility: Visibility,
  })
  .partial()
  .superRefine((b, ctx) => {
    if (Object.keys(b).length === 0) issue(ctx, [], 'atLeastOneField');
    if ((b.config === undefined) !== (b.answerKey === undefined))
      issue(ctx, ['answerKey'], 'configAnswerKeyTogether');
    if (b.config && b.answerKey && b.config.type !== b.answerKey.type)
      issue(ctx, ['answerKey', 'type'], 'answerKeyConfigTypeMismatch');
  });
export type UpdateQuestionBody = z.infer<typeof UpdateQuestionBody>;

export const QuestionSummary = z.object({
  id: Id,
  type: QuestionType,
  gradingMode: GradingMode,
  instruction: Instruction,
  instructionVi: z.string().nullable(),
  points: Points,
  tags: z.array(Tag),
  status: ContentStatus,
  visibility: Visibility,
  createdById: Id,
  createdByName: z.string(),
  /** Số worksheet (chưa archive) đang dùng câu này */
  usedInWorksheets: z.int().min(0),
  /** Ảnh đại diện (ảnh đầu tiên trong config), null nếu không có */
  thumbnail: MediaRef.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type QuestionSummary = z.infer<typeof QuestionSummary>;

export const QuestionView = QuestionSummary.extend({
  example: QuestionExample.nullable(),
  config: QuestionConfig,
  answerKey: QuestionAnswerKey,
  media: MediaMap,
});
export type QuestionView = z.infer<typeof QuestionView>;

export const QuestionListQuery = PageQuery.extend({
  type: QuestionType.optional(),
  status: ContentStatus.optional(),
  visibility: Visibility.optional(),
  tag: Tag.optional(),
  /** Chỉ câu của tôi */
  mine: z.coerce.boolean().optional(),
  createdById: Id.optional(),
});
export type QuestionListQuery = z.infer<typeof QuestionListQuery>;

export const TagsResponse = z.object({ items: z.array(z.object({ tag: Tag, count: z.int().min(0) })) });
export type TagsResponse = z.infer<typeof TagsResponse>;
