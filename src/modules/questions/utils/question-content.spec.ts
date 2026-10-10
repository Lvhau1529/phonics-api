import { describe, expect, it } from 'vitest';
import { type AuthUser } from '../../auth/types/auth.types';
import { normalizeTags, questionVisibleWhere, thumbnailOf } from './question-content';

const M = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
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

describe('question-content', () => {
  it('visibleWhere: GV thấy câu của mình hoặc SHARED đã PUBLISHED; ADMIN thấy tất cả', () => {
    expect(questionVisibleWhere(admin)).toEqual({});
    expect(questionVisibleWhere(teacher)).toEqual({
      OR: [{ createdById: teacher.id }, { visibility: 'SHARED', status: 'PUBLISHED' }],
    });
  });

  it('helpers: normalizeTags, thumbnailOf', () => {
    expect(normalizeTags([' Nn ', 'nn', 'Week 9'])).toEqual(['nn', 'week 9']);
    expect(
      thumbnailOf(
        { audioMediaId: A, imageMediaId: M },
        { [M]: { id: M, url: 'u', kind: 'IMAGE' }, [A]: { id: A, url: 'a', kind: 'AUDIO' } },
      )?.id,
    ).toBe(M);
    expect(thumbnailOf({ audioMediaId: A }, {})).toBeNull();
  });
});
