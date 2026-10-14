import { describe, expect, it } from 'vitest';
import {
  type SnapshotSource,
  buildSnapshot,
  hasManualItems,
  itemsOf,
  stripAnswerKeys,
} from '@/modules/worksheets/utils/worksheet-snapshot';

const M = '11111111-1111-4111-8111-111111111111';
const W = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const I1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const I2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const Q1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const Q2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const source: SnapshotSource = {
  id: W,
  title: 'Letter Nn — Handout 2',
  subject: 'PHONICS',
  topic: 'Letter Nn',
  grade: 'K',
  week: 9,
  day: 3,
  kind: 'HANDOUT',
  sections: [
    {
      id: S1,
      order: 5,
      title: 'Part 1',
      instruction: 'Look and circle.',
      items: [
        {
          id: I2,
          order: 2,
          pointsOverride: null,
          question: {
            id: Q2,
            type: 'SPEAK',
            instruction: 'Say the word.',
            instructionVi: null,
            points: 2,
            example: null,
            config: { type: 'SPEAK', prompt: 'Say: nest', imageMediaId: M },
            answerKey: { type: 'SPEAK' },
          },
        },
        {
          id: I1,
          order: 1,
          pointsOverride: 3,
          question: {
            id: Q1,
            type: 'MULTIPLE_CHOICE',
            instruction: 'Circle the correct word.',
            instructionVi: 'Khoanh từ đúng',
            points: 1,
            example: { text: 'E.g. jam' },
            config: {
              type: 'MULTIPLE_CHOICE',
              options: [
                { id: 'a', text: 'jam' },
                { id: 'b', text: 'ram' },
              ],
            },
            answerKey: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
          },
        },
      ],
    },
  ],
};

describe('worksheet snapshot', () => {
  it('sắp xếp theo order, điểm = override ?? question.points, maxScore là tổng', () => {
    const snap = buildSnapshot(source, new Date('2026-10-09T00:00:00Z'));
    const items = itemsOf(snap);
    expect(items.map((i) => i.worksheetItemId)).toEqual([I1, I2]);
    expect(items.map((i) => i.points)).toEqual([3, 2]);
    expect(snap.maxScore).toBe(5);
    expect(items[1].question.gradingMode).toBe('MANUAL');
    expect(hasManualItems(snap)).toBe(true);
    expect(snap.snapshotAt).toBe('2026-10-09T00:00:00.000Z');
  });

  it('stripAnswerKeys bỏ answerKey nhưng giữ config', () => {
    const student = stripAnswerKeys(buildSnapshot(source));
    const q = student.sections[0].items[0].question as Record<string, unknown>;
    expect(q.answerKey).toBeUndefined();
    expect(q.config).toBeDefined();
  });

  it('từ chối JSON câu hỏi không hợp lệ', () => {
    const bad: SnapshotSource = {
      ...source,
      sections: [
        {
          ...source.sections[0],
          items: [
            {
              ...source.sections[0].items[1],
              question: { ...source.sections[0].items[1].question, config: { type: 'MULTIPLE_CHOICE' } },
            },
          ],
        },
      ],
    };
    expect(() => buildSnapshot(bad)).toThrow();
  });
});
