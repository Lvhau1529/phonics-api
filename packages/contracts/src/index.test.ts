import { describe, expect, it } from 'vitest';
import {
  AVATARS,
  AvatarKey,
  AwardBonusBody,
  DEFAULT_AVATAR,
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

  it('nhận game Phonics Ocean (contracts 1.2.0)', () => {
    const r = GameResultBody.parse({ ...valid, gameId: 'phonics-ocean', levelId: 'sound-reef', total: 12 });
    expect(r.gameId).toBe('phonics-ocean');
  });

  it('từ chối game chưa đăng ký', () => {
    expect(GameResultBody.safeParse({ ...valid, gameId: 'unknown-game' }).success).toBe(false);
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

describe('AvatarKey / AVATARS', () => {
  it('picker chỉ gồm 8 con vật, mặc định nằm trong picker', () => {
    expect(AVATARS.map((a) => a.key)).toEqual([
      'tiger',
      'elephant',
      'lion',
      'monkey',
      'dog',
      'cat',
      'panda',
      'bunny',
    ]);
    expect(AVATARS.some((a) => a.key === DEFAULT_AVATAR)).toBe(true);
  });

  it('avatar cũ (pip / girl / boy) vẫn hợp lệ cho tài khoản đã chọn', () => {
    for (const key of ['pip', 'girl', 'boy']) expect(AvatarKey.safeParse(key).success).toBe(true);
    expect(UpdateProfileBody.safeParse({ avatarKey: 'dog' }).success).toBe(true);
    expect(UpdateProfileBody.safeParse({ avatarKey: 'dragon' }).success).toBe(false);
  });
});

// ---------- Phiếu bài tập (contracts 1.2.0) ----------
import {
  CreateQuestionBody,
  PresignMediaBody,
  SaveAnswersBody,
  UpdateQuestionBody,
  blankCount,
  collectMediaIds,
  gradingModeOf,
} from './index.js';

const MEDIA_A = '11111111-1111-4111-8111-111111111111';
const MEDIA_B = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';

describe('CreateQuestionBody', () => {
  const missingSound = {
    type: 'MISSING_SOUND',
    instruction: 'Write the missing sound. Then write the word.',
    config: { type: 'MISSING_SOUND', imageMediaId: MEDIA_A, pattern: 'm-a-_' },
    answerKey: { type: 'MISSING_SOUND', letters: ['p'], word: 'map' },
  };

  it('nhận MISSING_SOUND hợp lệ, điền mặc định points / tags / visibility', () => {
    const r = CreateQuestionBody.parse(missingSound);
    expect(r.points).toBe(1);
    expect(r.tags).toEqual([]);
    expect(r.visibility).toBe('SHARED');
    expect(blankCount('m-a-_')).toBe(1);
  });

  it('từ chối số chữ khác số ô trống', () => {
    const r = CreateQuestionBody.safeParse({
      ...missingSound,
      answerKey: { type: 'MISSING_SOUND', letters: ['a', 'p'], word: 'map' },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['answerKey', 'letters']);
  });

  it('từ chối config.type khác type', () => {
    const r = CreateQuestionBody.safeParse({
      ...missingSound,
      config: { type: 'SPEAK', prompt: 'Say: map' },
    });
    expect(r.success).toBe(false);
  });

  it('WORD_ORDER: accepted phải là hoán vị', () => {
    const base = {
      type: 'WORD_ORDER',
      instruction: 'Put the words in order.',
      config: { type: 'WORD_ORDER', words: ['hear', 'I', 'the hammer.'] },
    };
    expect(
      CreateQuestionBody.safeParse({ ...base, answerKey: { type: 'WORD_ORDER', accepted: [[1, 0, 2]] } })
        .success,
    ).toBe(true);
    expect(
      CreateQuestionBody.safeParse({ ...base, answerKey: { type: 'WORD_ORDER', accepted: [[1, 1, 2]] } })
        .success,
    ).toBe(false);
  });

  it('NUMBER_PICTURES: mỗi số gán cho đúng một ảnh', () => {
    const body = {
      type: 'NUMBER_PICTURES',
      instruction: 'Number the pictures.',
      config: {
        type: 'NUMBER_PICTURES',
        words: [
          { number: 1, word: 'moon' },
          { number: 2, word: 'milk' },
        ],
        images: [
          { id: 'a', mediaId: MEDIA_A },
          { id: 'b', mediaId: MEDIA_B },
        ],
      },
      answerKey: {
        type: 'NUMBER_PICTURES',
        numbers: [
          { imageId: 'a', number: 1 },
          { imageId: 'b', number: 1 },
        ],
      },
    };
    expect(CreateQuestionBody.safeParse(body).success).toBe(false);
    const ok = {
      ...body,
      answerKey: {
        type: 'NUMBER_PICTURES',
        numbers: [
          { imageId: 'a', number: 1 },
          { imageId: 'b', number: 2 },
        ],
      },
    };
    const r = CreateQuestionBody.parse(ok);
    expect(r.config.type === 'NUMBER_PICTURES' && r.config.writeWord).toBe(false);
  });

  it('SPEAK là dạng chấm tay', () => {
    expect(gradingModeOf('SPEAK')).toBe('MANUAL');
    expect(gradingModeOf('MULTIPLE_CHOICE')).toBe('AUTO');
  });
});

describe('UpdateQuestionBody', () => {
  it('config và answerKey phải đi cùng nhau', () => {
    expect(UpdateQuestionBody.safeParse({ instruction: 'x' }).success).toBe(true);
    expect(UpdateQuestionBody.safeParse({ config: { type: 'SPEAK', prompt: 'Say: map' } }).success).toBe(
      false,
    );
    expect(UpdateQuestionBody.safeParse({}).success).toBe(false);
  });
});

describe('PresignMediaBody', () => {
  it('từ chối mime không hỗ trợ và file quá lớn', () => {
    expect(
      PresignMediaBody.safeParse({ kind: 'IMAGE', mimeType: 'image/gif', sizeBytes: 10, fileName: 'a.gif' })
        .success,
    ).toBe(false);
    expect(
      PresignMediaBody.safeParse({
        kind: 'AUDIO',
        mimeType: 'audio/webm;codecs=opus',
        sizeBytes: 11 * 1024 * 1024,
        fileName: 'a.webm',
      }).success,
    ).toBe(false);
    expect(
      PresignMediaBody.safeParse({
        kind: 'AUDIO',
        mimeType: 'audio/webm;codecs=opus',
        sizeBytes: 1000,
        fileName: 'a.webm',
      }).success,
    ).toBe(true);
  });
});

describe('collectMediaIds', () => {
  it('gom mọi khoá *MediaId / *MediaIds / mediaId, bỏ qua id khác', () => {
    const ids = collectMediaIds({
      imageMediaId: MEDIA_A,
      options: [{ id: 'x', mediaId: MEDIA_B }],
      imageMediaIds: [MEDIA_A],
      worksheetItemId: ITEM,
    });
    expect(ids.sort()).toEqual([MEDIA_A, MEDIA_B].sort());
  });
});

describe('SaveAnswersBody', () => {
  it('nhận answer theo type, từ chối field lạ', () => {
    const ok = { answers: [{ worksheetItemId: ITEM, answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' } }] };
    expect(SaveAnswersBody.safeParse(ok).success).toBe(true);
    expect(SaveAnswersBody.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});

describe('ROLE_DEFAULT_PERMISSIONS (worksheets)', () => {
  it('giáo viên mặc định có đủ 4 quyền phiếu bài tập', () => {
    for (const p of ['worksheets.manage', 'worksheets.assign', 'worksheets.grade', 'worksheets.viewStats'])
      expect(ROLE_DEFAULT_PERMISSIONS.TEACHER).toContain(p);
  });
});

import {
  UpdateClassBody,
  VALIDATION_MESSAGES,
  ValidationMessage,
  isValidationMessageKey,
  translateIssueMessage,
} from './index.js';

describe('Message validate song ngữ (khoá + translateIssueMessage)', () => {
  it('vi và en có cùng bộ khoá; ValidationMessage.x === x', () => {
    expect(Object.keys(VALIDATION_MESSAGES.en).sort()).toEqual(Object.keys(VALIDATION_MESSAGES.vi).sort());
    expect(ValidationMessage.atLeastOneField).toBe('atLeastOneField');
    expect(isValidationMessageKey('atLeastOneField')).toBe(true);
    expect(isValidationMessageKey('toString')).toBe(false);
  });

  it('refine trả khoá, dịch theo ngôn ngữ', () => {
    const r = UpdateClassBody.safeParse({});
    expect(r.success).toBe(false);
    if (r.success) return;
    const issue = r.error.issues[0];
    expect(issue.message).toBe('atLeastOneField');
    expect(translateIssueMessage(issue, 'vi')).toBe('Cần ít nhất một trường');
    expect(translateIssueMessage(issue, 'en')).toBe('At least one field is required');
  });

  it('khoá có tham số đi qua kiểm tra chéo của CreateQuestionBody (giữ params)', () => {
    const r = CreateQuestionBody.safeParse({
      type: 'CROSSWORD',
      instruction: 'Look and write.',
      config: {
        type: 'CROSSWORD',
        rows: 5,
        cols: 5,
        words: [{ number: 1, direction: 'across', start: { r: 0, c: 0 }, length: 3, clueMediaId: MEDIA_A }],
      },
      answerKey: { type: 'CROSSWORD', words: [{ number: 1, direction: 'across', answer: 'cats' }] },
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const issue = r.error.issues.find((i) => i.message === 'answerLength');
    expect(issue?.path).toEqual(['answerKey', 'words', 0, 'answer']);
    expect(issue && translateIssueMessage(issue, 'en')).toBe('The answer must be 3 letters long');
    expect(issue && translateIssueMessage(issue, 'vi')).toBe('Đáp án phải dài 3 chữ');
  });

  it('message không phải khoá (mặc định của zod) giữ nguyên', () => {
    expect(translateIssueMessage({ message: 'Too small' }, 'vi')).toBe('Too small');
  });
});
