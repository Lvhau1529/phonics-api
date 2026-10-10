import { describe, expect, it } from 'vitest';
import { type AuthUser } from '../../auth/types/auth.types';
import { type WorksheetDetailRow } from '../types/worksheet.types';
import {
  assertPublishable,
  assertStructureBelongs,
  countItems,
  worksheetVisibleWhere,
} from './worksheet-rules';

const teacher: AuthUser = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  role: 'TEACHER',
  status: 'ACTIVE',
  tokenVersion: 0,
};
const admin: AuthUser = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  role: 'ADMIN',
  status: 'ACTIVE',
  tokenVersion: 0,
};

const row = (items: { id: string; questionId: string; status: string }[]) =>
  ({
    sections: [
      {
        id: 's1',
        items: items.map((it) => ({ id: it.id, questionId: it.questionId, question: { status: it.status } })),
      },
    ],
  }) as unknown as WorksheetDetailRow;

describe('worksheet-rules', () => {
  it('worksheetVisibleWhere: GV thấy phiếu của mình hoặc SHARED đã PUBLISHED; ADMIN thấy tất cả', () => {
    expect(worksheetVisibleWhere(admin)).toEqual({});
    expect(worksheetVisibleWhere(teacher)).toEqual({
      OR: [{ createdById: teacher.id }, { visibility: 'SHARED', status: 'PUBLISHED' }],
    });
  });

  it('assertStructureBelongs: id section / item lạ → VALIDATION_ERROR; id cũ hoặc không id → hợp lệ', () => {
    const current = row([{ id: 'i1', questionId: 'q1', status: 'PUBLISHED' }]);
    expect(() =>
      assertStructureBelongs(current, {
        sections: [
          { id: 's1', title: 'Part 1', items: [{ id: 'i1', questionId: 'q1' }, { questionId: 'q2' }] },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      assertStructureBelongs(current, { sections: [{ id: 'sX', title: 'Part 1', items: [] }] }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() =>
      assertStructureBelongs(current, {
        sections: [{ id: 's1', title: 'Part 1', items: [{ id: 'iX', questionId: 'q1' }] }],
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('assertPublishable: phiếu rỗng → WORKSHEET_EMPTY; còn câu DRAFT → QUESTION_NOT_PUBLISHED', () => {
    expect(() => assertPublishable(row([]))).toThrow(expect.objectContaining({ code: 'WORKSHEET_EMPTY' }));
    expect(() =>
      assertPublishable(
        row([
          { id: 'i1', questionId: 'q1', status: 'PUBLISHED' },
          { id: 'i2', questionId: 'q2', status: 'DRAFT' },
        ]),
      ),
    ).toThrow(expect.objectContaining({ code: 'QUESTION_NOT_PUBLISHED', details: { questionIds: ['q2'] } }));
    expect(() => assertPublishable(row([{ id: 'i1', questionId: 'q1', status: 'PUBLISHED' }]))).not.toThrow();
    expect(countItems(row([{ id: 'i1', questionId: 'q1', status: 'PUBLISHED' }]))).toBe(1);
  });
});
