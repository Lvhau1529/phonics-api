import { type AnswerKeyOf, type AnswerOf, type Cell, type ConfigOf } from '@phonics/contracts';
import { anyWord, normalizeWord, sameWord } from './normalize';
import { type GradeResult, ratio } from './types';

/**
 * Hàm chấm thuần cho 12 dạng AUTO (ADR 0019). Không truy DB, không ném lỗi với answer thiếu trường:
 * mọi phần thiếu coi như sai. `fraction` theo luật điểm một phần của từng dạng.
 */

const cellKey = (c: Cell) => `${c.r},${c.c}`;
const sameCell = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;

export function gradeMissingSound(
  _c: ConfigOf<'MISSING_SOUND'>,
  k: AnswerKeyOf<'MISSING_SOUND'>,
  a: AnswerOf<'MISSING_SOUND'>,
): GradeResult {
  const letters = k.letters.map((expected, i) => sameWord(a.letters[i], expected));
  const lettersOk = letters.every(Boolean);
  const wordOk = sameWord(a.word, k.word);
  const fraction = (lettersOk ? 0.5 : 0) + (wordOk ? 0.5 : 0);
  return { fraction, correct: fraction === 1, detail: { letters, word: wordOk } };
}

export function gradeCrossword(
  c: ConfigOf<'CROSSWORD'>,
  k: AnswerKeyOf<'CROSSWORD'>,
  a: AnswerOf<'CROSSWORD'>,
): GradeResult {
  const prefilled = new Map(c.prefilled.map((p) => [cellKey(p), p.letter.toLowerCase()]));
  const given = new Map(a.cells.map((cell) => [cellKey(cell), cell.letter.toLowerCase()]));
  const words = k.words.map((kw) => {
    const cw = c.words.find((w) => w.number === kw.number && w.direction === kw.direction);
    if (!cw) return { number: kw.number, direction: kw.direction, correct: false };
    const answer = normalizeWord(kw.answer);
    let correct = answer.length === cw.length;
    for (let i = 0; i < cw.length && correct; i++) {
      const cell: Cell = {
        r: cw.direction === 'down' ? cw.start.r + i : cw.start.r,
        c: cw.direction === 'across' ? cw.start.c + i : cw.start.c,
      };
      const key = cellKey(cell);
      const letter = prefilled.get(key) ?? given.get(key) ?? '';
      if (letter !== answer[i]) correct = false;
    }
    return { number: kw.number, direction: kw.direction, correct };
  });
  const ok = words.filter((w) => w.correct).length;
  const fraction = ratio(ok, words.length);
  return { fraction, correct: fraction === 1, detail: { words } };
}

export function gradeUnscrambleWord(
  _c: ConfigOf<'UNSCRAMBLE_WORD'>,
  k: AnswerKeyOf<'UNSCRAMBLE_WORD'>,
  a: AnswerOf<'UNSCRAMBLE_WORD'>,
): GradeResult {
  const correct = anyWord(a.word, [k.word, ...k.accepted]);
  return { fraction: correct ? 1 : 0, correct, detail: { word: correct } };
}

export function gradePickLetters(
  _c: ConfigOf<'PICK_LETTERS'>,
  k: AnswerKeyOf<'PICK_LETTERS'>,
  a: AnswerOf<'PICK_LETTERS'>,
): GradeResult {
  const expected = new Set(k.letterIds);
  const got = new Set(a.letterIds);
  const lettersOk = expected.size === got.size && [...expected].every((id) => got.has(id));
  const wordOk = sameWord(a.word, k.word);
  const fraction = (lettersOk ? 0.5 : 0) + (wordOk ? 0.5 : 0);
  return { fraction, correct: fraction === 1, detail: { letters: lettersOk, word: wordOk } };
}

export function gradeWordSearch(
  _c: ConfigOf<'WORD_SEARCH'>,
  k: AnswerKeyOf<'WORD_SEARCH'>,
  a: AnswerOf<'WORD_SEARCH'>,
): GradeResult {
  const words = k.placements.map((p) => {
    const found = a.found.some(
      (f) =>
        sameWord(f.word, p.word) &&
        ((sameCell(f.start, p.start) && sameCell(f.end, p.end)) ||
          (sameCell(f.start, p.end) && sameCell(f.end, p.start))),
    );
    return { word: p.word, correct: found };
  });
  const ok = words.filter((w) => w.correct).length;
  const fraction = ratio(ok, words.length);
  return { fraction, correct: fraction === 1, detail: { words } };
}

export function gradeOddOneOut(
  _c: ConfigOf<'ODD_ONE_OUT'>,
  k: AnswerKeyOf<'ODD_ONE_OUT'>,
  a: AnswerOf<'ODD_ONE_OUT'>,
): GradeResult {
  const correct = a.optionId === k.optionId;
  return { fraction: correct ? 1 : 0, correct, detail: { option: correct } };
}

export function gradePatternNext(
  c: ConfigOf<'PATTERN_NEXT'>,
  k: AnswerKeyOf<'PATTERN_NEXT'>,
  a: AnswerOf<'PATTERN_NEXT'>,
): GradeResult {
  const optionOk = a.optionId === k.optionId;
  if (!c.requireWord || !k.word) {
    return { fraction: optionOk ? 1 : 0, correct: optionOk, detail: { option: optionOk } };
  }
  const wordOk = sameWord(a.word, k.word);
  const fraction = (optionOk ? 0.5 : 0) + (wordOk ? 0.5 : 0);
  return { fraction, correct: fraction === 1, detail: { option: optionOk, word: wordOk } };
}

export function gradeNumberPictures(
  c: ConfigOf<'NUMBER_PICTURES'>,
  k: AnswerKeyOf<'NUMBER_PICTURES'>,
  a: AnswerOf<'NUMBER_PICTURES'>,
): GradeResult {
  const given = new Map(a.numbers.map((n) => [n.imageId, n.number]));
  const numbers = k.numbers.map((kn) => ({
    imageId: kn.imageId,
    correct: given.get(kn.imageId) === kn.number,
  }));
  const numberFraction = ratio(numbers.filter((n) => n.correct).length, numbers.length);
  if (!c.writeWord) {
    return { fraction: numberFraction, correct: numberFraction === 1, detail: { numbers } };
  }
  const wordByNumber = new Map(c.words.map((w) => [w.number, w.word]));
  const givenWords = new Map((a.words ?? []).map((w) => [w.imageId, w.word]));
  const words = k.numbers.map((kn) => ({
    imageId: kn.imageId,
    correct: sameWord(givenWords.get(kn.imageId), wordByNumber.get(kn.number)),
  }));
  const wordFraction = ratio(words.filter((w) => w.correct).length, words.length);
  const fraction = 0.5 * numberFraction + 0.5 * wordFraction;
  return { fraction, correct: fraction === 1, detail: { numbers, words } };
}

export function gradeMultipleChoice(
  _c: ConfigOf<'MULTIPLE_CHOICE'>,
  k: AnswerKeyOf<'MULTIPLE_CHOICE'>,
  a: AnswerOf<'MULTIPLE_CHOICE'>,
): GradeResult {
  const correct = a.optionId === k.optionId;
  return { fraction: correct ? 1 : 0, correct, detail: { option: correct } };
}

export function gradeFillBlank(
  _c: ConfigOf<'FILL_BLANK_WORD_BANK'>,
  k: AnswerKeyOf<'FILL_BLANK_WORD_BANK'>,
  a: AnswerOf<'FILL_BLANK_WORD_BANK'>,
): GradeResult {
  const given = new Map(a.blanks.map((b) => [`${b.sentenceId}:${b.index}`, b.word]));
  const blanks = k.blanks.map((kb) => ({
    sentenceId: kb.sentenceId,
    index: kb.index,
    correct: sameWord(given.get(`${kb.sentenceId}:${kb.index}`), kb.word),
  }));
  const fraction = ratio(blanks.filter((b) => b.correct).length, blanks.length);
  return { fraction, correct: fraction === 1, detail: { blanks } };
}

export function gradeWordOrder(
  _c: ConfigOf<'WORD_ORDER'>,
  k: AnswerKeyOf<'WORD_ORDER'>,
  a: AnswerOf<'WORD_ORDER'>,
): GradeResult {
  const correct = k.accepted.some(
    (order) => order.length === a.order.length && order.every((idx, i) => idx === a.order[i]),
  );
  return { fraction: correct ? 1 : 0, correct, detail: { order: correct } };
}

export function gradeInlineChoice(
  _c: ConfigOf<'INLINE_CHOICE'>,
  k: AnswerKeyOf<'INLINE_CHOICE'>,
  a: AnswerOf<'INLINE_CHOICE'>,
): GradeResult {
  const given = new Map(a.picks.map((p) => [p.blankId, p.option]));
  const picks = k.picks.map((kp) => ({ blankId: kp.blankId, correct: given.get(kp.blankId) === kp.option }));
  const fraction = ratio(picks.filter((p) => p.correct).length, picks.length);
  return { fraction, correct: fraction === 1, detail: { picks } };
}
