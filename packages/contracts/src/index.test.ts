import { describe, expect, it } from 'vitest';
import {
  AwardBonusBody,
  EventBatchBody,
  GameResultBody,
  MarkReadBody,
  PageQuery,
  RegisterBody,
  ROLE_DEFAULT_PERMISSIONS,
  UpdateProfileBody,
  parseSort,
} from './index.js';

describe('GameResultBody', () => {
  const valid = {
    clientSessionId: '3f1d0f2a-0c2a-4e2b-9f0e-6a7b8c9d0e1f',
    gameId: 'bread-catcher',
    mode: 'solo',
    levelId: 'easy',
    correct: 4,
    total: 5,
    score: 400,
    endedBy: 'completed',
    playedAt: '2026-10-01T08:30:00.000Z',
  };

  it('nhận payload hợp lệ và điền details mặc định', () => {
    const r = GameResultBody.parse(valid);
    expect(r.details).toEqual({});
  });

  it('từ chối correct > total', () => {
    expect(GameResultBody.safeParse({ ...valid, correct: 6 }).success).toBe(false);
  });

  it('từ chối field lạ (strict)', () => {
    expect(GameResultBody.safeParse({ ...valid, hack: 1 }).success).toBe(false);
  });

  it('từ chối mode class ở v1', () => {
    expect(GameResultBody.safeParse({ ...valid, mode: 'class' }).success).toBe(false);
  });
});

describe('RegisterBody', () => {
  it('chuẩn hoá email về chữ thường', () => {
    const r = RegisterBody.parse({
      email: ' Kid@Example.com ',
      password: 'secret1',
      displayName: ' Bé Na ',
      classId: '3f1d0f2a-0c2a-4e2b-9f0e-6a7b8c9d0e1f',
    });
    expect(r.email).toBe('kid@example.com');
    expect(r.displayName).toBe('Bé Na');
  });
});

describe('UpdateProfileBody', () => {
  it('từ chối body rỗng', () => {
    expect(UpdateProfileBody.safeParse({}).success).toBe(false);
  });
});

describe('MarkReadBody', () => {
  it('cho phép không có ids (đọc tất cả)', () => {
    expect(MarkReadBody.parse({})).toEqual({});
  });
  it('từ chối ids rỗng', () => {
    expect(MarkReadBody.safeParse({ ids: [] }).success).toBe(false);
  });
});

describe('AwardBonusBody', () => {
  it('từ chối 0 điểm', () => {
    expect(
      AwardBonusBody.safeParse({ studentId: '3f1d0f2a-0c2a-4e2b-9f0e-6a7b8c9d0e1f', points: 0, note: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('EventBatchBody', () => {
  it('giới hạn 50 sự kiện', () => {
    const ev = { gameId: 'food-stream', type: 'VIEW', occurredAt: '2026-10-01T08:30:00.000Z' };
    const body = { clientId: '3f1d0f2a-0c2a-4e2b-9f0e-6a7b8c9d0e1f', events: Array(51).fill(ev) };
    expect(EventBatchBody.safeParse(body).success).toBe(false);
  });
});

describe('PageQuery / parseSort', () => {
  it('ép kiểu từ query string và giới hạn pageSize', () => {
    expect(PageQuery.parse({ page: '2', pageSize: '50' })).toMatchObject({ page: 2, pageSize: 50 });
    expect(PageQuery.safeParse({ pageSize: '500' }).success).toBe(false);
  });
  it('tách sort', () => {
    expect(parseSort('createdAt:desc')).toEqual({ field: 'createdAt', dir: 'desc' });
    expect(parseSort(undefined)).toBeUndefined();
  });
});

describe('ROLE_DEFAULT_PERMISSIONS', () => {
  it('giáo viên mặc định không được chuyển lớp, được cộng điểm', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.TEACHER).not.toContain('class.changeStudentClass');
    expect(ROLE_DEFAULT_PERMISSIONS.TEACHER).toContain('points.award');
  });
});
