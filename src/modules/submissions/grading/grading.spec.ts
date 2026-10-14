import { type SnapshotQuestion } from '@phonics/contracts';
import { describe, expect, it } from 'vitest';
import { gradeItem, normalizeSentence, normalizeWord, scoreOf } from '@/modules/submissions/grading/index';

const M = '11111111-1111-4111-8111-111111111111';

const q = (
  type: SnapshotQuestion['type'],
  config: Record<string, unknown>,
  answerKey: Record<string, unknown>,
): Pick<SnapshotQuestion, 'type' | 'config' | 'answerKey'> =>
  ({ type, config: { type, ...config }, answerKey: { type, ...answerKey } }) as never;

describe('normalize', () => {
  it('bỏ hoa thường, khoảng trắng, dấu câu', () => {
    expect(normalizeWord('  Ant. ')).toBe('ant');
    expect(normalizeWord("don't")).toBe("don't");
    expect(normalizeSentence('  We  see the nest. ')).toBe('we see the nest');
  });
});

describe('gradeItem', () => {
  it('MISSING_SOUND: chữ 0.5 + từ 0.5', () => {
    const question = q(
      'MISSING_SOUND',
      { imageMediaId: M, pattern: 'm-a-_' },
      { letters: ['p'], word: 'map' },
    );
    expect(gradeItem(question, { type: 'MISSING_SOUND', letters: ['P '], word: 'Map' })).toMatchObject({
      fraction: 1,
      correct: true,
    });
    expect(gradeItem(question, { type: 'MISSING_SOUND', letters: ['t'], word: 'map' })).toMatchObject({
      fraction: 0.5,
      correct: false,
      detail: { letters: [false], word: true },
    });
  });

  it('trả 0 khi chưa trả lời, sai dạng hoặc dạng chấm tay', () => {
    const question = q(
      'MULTIPLE_CHOICE',
      {
        options: [
          { id: 'a', text: 'jam' },
          { id: 'b', text: 'ram' },
        ],
      },
      { optionId: 'a' },
    );
    expect(gradeItem(question, null).fraction).toBe(0);
    expect(gradeItem(question, { type: 'ODD_ONE_OUT', optionId: 'a' }).fraction).toBe(0);
    expect(gradeItem(question, { hack: 1 }).fraction).toBe(0);
    const speak = q('SPEAK', { prompt: 'Say: map' }, {});
    expect(gradeItem(speak, { type: 'SPEAK', recordingMediaId: M }).fraction).toBe(0);
  });

  it('MULTIPLE_CHOICE / ODD_ONE_OUT: 1 hoặc 0', () => {
    const mc = q(
      'MULTIPLE_CHOICE',
      {
        options: [
          { id: 'a', text: 'jam' },
          { id: 'b', text: 'ram' },
        ],
      },
      { optionId: 'a' },
    );
    expect(gradeItem(mc, { type: 'MULTIPLE_CHOICE', optionId: 'a' }).correct).toBe(true);
    expect(gradeItem(mc, { type: 'MULTIPLE_CHOICE', optionId: 'b' }).correct).toBe(false);
    expect(gradeItem(mc, { type: 'MULTIPLE_CHOICE', optionId: null }).correct).toBe(false);
  });

  it('UNSCRAMBLE_WORD: chấp nhận đáp án phụ, không phân biệt hoa thường', () => {
    const question = q(
      'UNSCRAMBLE_WORD',
      { imageMediaId: M, scrambled: 'tac' },
      { word: 'cat', accepted: ['act'] },
    );
    expect(gradeItem(question, { type: 'UNSCRAMBLE_WORD', word: 'ACT' }).correct).toBe(true);
    expect(gradeItem(question, { type: 'UNSCRAMBLE_WORD', word: 'tac' }).correct).toBe(false);
  });

  it('PICK_LETTERS: tập chữ không theo thứ tự + từ', () => {
    const question = q(
      'PICK_LETTERS',
      {
        imageMediaId: M,
        letters: [
          { id: 'n', letter: 'n' },
          { id: 'e', letter: 'e' },
          { id: 't', letter: 't' },
          { id: 'p', letter: 'p' },
        ],
      },
      { letterIds: ['n', 'e', 't'], word: 'net' },
    );
    expect(
      gradeItem(question, { type: 'PICK_LETTERS', letterIds: ['t', 'n', 'e'], word: 'net' }).fraction,
    ).toBe(1);
    expect(gradeItem(question, { type: 'PICK_LETTERS', letterIds: ['n', 'e'], word: 'net' }).fraction).toBe(
      0.5,
    );
  });

  it('WORD_ORDER: khớp một trong các trật tự chấp nhận', () => {
    const question = q('WORD_ORDER', { words: ['hear', 'I', 'the hammer.'] }, { accepted: [[1, 0, 2]] });
    expect(gradeItem(question, { type: 'WORD_ORDER', order: [1, 0, 2] }).correct).toBe(true);
    expect(gradeItem(question, { type: 'WORD_ORDER', order: [0, 1, 2] }).correct).toBe(false);
    expect(gradeItem(question, { type: 'WORD_ORDER', order: [1, 0] }).correct).toBe(false);
  });

  it('FILL_BLANK_WORD_BANK: điểm theo số chỗ trống đúng', () => {
    const question = q(
      'FILL_BLANK_WORD_BANK',
      {
        wordBank: ['hear', 'taste'],
        sentences: [
          { id: 's1', text: 'I ___ the children.' },
          { id: 's2', text: 'We ___ the corn.' },
        ],
      },
      {
        blanks: [
          { sentenceId: 's1', index: 0, word: 'hear' },
          { sentenceId: 's2', index: 0, word: 'taste' },
        ],
      },
    );
    const r = gradeItem(question, {
      type: 'FILL_BLANK_WORD_BANK',
      blanks: [
        { sentenceId: 's1', index: 0, word: 'Hear' },
        { sentenceId: 's2', index: 0, word: 'hear' },
      ],
    });
    expect(r.fraction).toBe(0.5);
    expect(scoreOf(r, 2)).toBe(1);
  });

  it('NUMBER_PICTURES: chỉ đánh số, hoặc 50/50 với viết từ', () => {
    const base = {
      words: [
        { number: 1, word: 'moon' },
        { number: 2, word: 'milk' },
      ],
      images: [
        { id: 'a', mediaId: M },
        { id: 'b', mediaId: M },
      ],
      showWordBank: true,
    };
    const key = {
      numbers: [
        { imageId: 'a', number: 1 },
        { imageId: 'b', number: 2 },
      ],
    };
    const only = q('NUMBER_PICTURES', { ...base, writeWord: false }, key);
    expect(
      gradeItem(only, {
        type: 'NUMBER_PICTURES',
        numbers: [
          { imageId: 'a', number: 1 },
          { imageId: 'b', number: 1 },
        ],
      }).fraction,
    ).toBe(0.5);
    const withWords = q('NUMBER_PICTURES', { ...base, writeWord: true }, key);
    const r = gradeItem(withWords, {
      type: 'NUMBER_PICTURES',
      numbers: [
        { imageId: 'a', number: 1 },
        { imageId: 'b', number: 2 },
      ],
      words: [
        { imageId: 'a', word: 'moon' },
        { imageId: 'b', word: 'mik' },
      ],
    });
    expect(r.fraction).toBe(0.75);
  });

  it('CROSSWORD: theo từ; ô cho sẵn không cần nhập', () => {
    const question = q(
      'CROSSWORD',
      {
        rows: 3,
        cols: 3,
        words: [
          { number: 1, direction: 'across', start: { r: 0, c: 0 }, length: 3, clueMediaId: M },
          { number: 2, direction: 'down', start: { r: 0, c: 2 }, length: 3, clueMediaId: M },
        ],
        prefilled: [{ r: 0, c: 2, letter: 'p' }],
      },
      {
        words: [
          { number: 1, direction: 'across', answer: 'map' },
          { number: 2, direction: 'down', answer: 'pen' },
        ],
      },
    );
    const r = gradeItem(question, {
      type: 'CROSSWORD',
      cells: [
        { r: 0, c: 0, letter: 'M' },
        { r: 0, c: 1, letter: 'a' },
        { r: 1, c: 2, letter: 'e' },
        { r: 2, c: 2, letter: 'x' },
      ],
    });
    expect(r.fraction).toBe(0.5);
    expect(r.detail).toEqual({
      words: [
        { number: 1, direction: 'across', correct: true },
        { number: 2, direction: 'down', correct: false },
      ],
    });
  });

  it('WORD_SEARCH: chấp nhận start/end đảo ngược', () => {
    const question = q(
      'WORD_SEARCH',
      { rows: 3, cols: 3, grid: ['cat', 'xxx', 'xxx'], words: [{ word: 'cat' }] },
      { placements: [{ word: 'cat', start: { r: 0, c: 0 }, end: { r: 0, c: 2 } }] },
    );
    expect(
      gradeItem(question, {
        type: 'WORD_SEARCH',
        found: [{ word: 'cat', start: { r: 0, c: 2 }, end: { r: 0, c: 0 } }],
      }).correct,
    ).toBe(true);
    expect(gradeItem(question, { type: 'WORD_SEARCH', found: [] }).fraction).toBe(0);
  });

  it('PATTERN_NEXT: có / không yêu cầu viết từ', () => {
    const cfg = {
      sequence: [M, M, M],
      options: [
        { id: 'a', mediaId: M, word: 'nest' },
        { id: 'b', mediaId: M },
      ],
    };
    const noWord = q('PATTERN_NEXT', { ...cfg, requireWord: false }, { optionId: 'a' });
    expect(gradeItem(noWord, { type: 'PATTERN_NEXT', optionId: 'a' }).fraction).toBe(1);
    const withWord = q('PATTERN_NEXT', { ...cfg, requireWord: true }, { optionId: 'a', word: 'nest' });
    expect(gradeItem(withWord, { type: 'PATTERN_NEXT', optionId: 'a', word: 'nets' }).fraction).toBe(0.5);
  });

  it('INLINE_CHOICE: theo số chỗ đúng', () => {
    const question = q(
      'INLINE_CHOICE',
      {
        imageMediaIds: [],
        text: 'Sam and I {{b1}} taste the corns. {{b2}} touch the pig.',
        blanks: [
          { id: 'b1', options: ['like to', 'like'] },
          { id: 'b2', options: ['We', 'I'] },
        ],
      },
      {
        picks: [
          { blankId: 'b1', option: 'like to' },
          { blankId: 'b2', option: 'We' },
        ],
      },
    );
    expect(
      gradeItem(question, {
        type: 'INLINE_CHOICE',
        picks: [
          { blankId: 'b1', option: 'like to' },
          { blankId: 'b2', option: 'I' },
        ],
      }).fraction,
    ).toBe(0.5);
  });
});
