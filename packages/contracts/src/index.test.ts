import { describe, expect, it } from 'vitest';
import {
  AVATARS,
  isMimeAllowed,
  MEDIA_LIMITS,
  mediaLimitsFor,
  STUDENT_MEDIA_LIMITS,
  AvatarKey,
  AwardBonusBody,
  BILLING_POLICY,
  CancelAttendanceSessionsBody,
  CancelDigestBody,
  CreateExtraSlotBody,
  CreateSlotAssignmentBody,
  CreateStudentsBody,
  DEFAULT_AVATAR,
  EventBatchBody,
  GameResultBody,
  MarkReadBody,
  PageQuery,
  RegisterBody,
  RegisterFamilyBody,
  StudentAttendanceQuery,
  UpdateAttendanceRecordsBody,
  SetStudentGuardiansBody,
  ROLE_DEFAULT_PERMISSIONS,
  UpdateExtraRateBody,
  CreateStudentRateBody,
  TuitionQuery,
  UpdateTuitionSettings,
  monthSpan,
  UpdateExtraSlotBody,
  UpdateProfileBody,
  UpdateSlotAssignmentBody,
  UpdateStudentBody,
  parseSort,
  studentFullName,
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

  it('nhận game Odd One Out / Little English Explorers (contracts 1.4.0)', () => {
    expect(GameResultBody.parse({ ...valid, gameId: 'odd-one-out', levelId: 'easy', total: 6 }).gameId).toBe(
      'odd-one-out',
    );
    expect(
      GameResultBody.parse({ ...valid, gameId: 'english-explorers', levelId: 'habitats', total: 10 }).gameId,
    ).toBe('english-explorers');
  });

  it('nhận game Halloween Candy Quest (contracts 1.5.0)', () => {
    expect(
      GameResultBody.parse({ ...valid, gameId: 'halloween-candy-quest', levelId: 'easy', total: 8 }).gameId,
    ).toBe('halloween-candy-quest');
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

describe('UpdateStudentBody (tên tiếng Việt / tiếng Anh)', () => {
  it('nhận tên tiếng Việt, xoá tên tiếng Anh bằng null, trim', () => {
    expect(UpdateStudentBody.parse({ vietnameseName: '  Nguyễn Văn An ', englishName: null })).toEqual({
      vietnameseName: 'Nguyễn Văn An',
      englishName: null,
    });
  });

  it('từ chối tên rỗng / quá 30 ký tự; vẫn nhận displayName của client cũ', () => {
    expect(UpdateStudentBody.safeParse({ vietnameseName: '  ' }).success).toBe(false);
    expect(UpdateStudentBody.safeParse({ englishName: 'x'.repeat(31) }).success).toBe(false);
    expect(UpdateStudentBody.parse({ displayName: 'Bin' })).toEqual({ displayName: 'Bin' });
  });
});

describe('studentFullName', () => {
  it('ghép tên tiếng Anh trong ngoặc khi có', () => {
    expect(studentFullName({ vietnameseName: 'Nguyễn Văn An', englishName: 'Andy' })).toBe(
      'Nguyễn Văn An (Andy)',
    );
    expect(studentFullName({ vietnameseName: 'Nguyễn Văn An', englishName: null })).toBe('Nguyễn Văn An');
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
  PermissionCode,
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

describe('media limits', () => {
  it('học sinh: chỉ PNG / ghi âm của game, trần nhỏ hơn GV; GV / admin theo MEDIA_LIMITS', () => {
    expect(mediaLimitsFor('STUDENT')).toBe(STUDENT_MEDIA_LIMITS);
    expect(mediaLimitsFor('TEACHER')).toBe(MEDIA_LIMITS);
    expect(mediaLimitsFor('ADMIN')).toBe(MEDIA_LIMITS);
    for (const kind of ['IMAGE', 'AUDIO'] as const) {
      expect(STUDENT_MEDIA_LIMITS[kind].maxBytes).toBeLessThan(MEDIA_LIMITS[kind].maxBytes);
      for (const mime of STUDENT_MEDIA_LIMITS[kind].mimeTypes) expect(isMimeAllowed(kind, mime)).toBe(true);
    }
  });

  it('PresignMediaBody chặn vượt MEDIA_LIMITS', () => {
    const body = { kind: 'AUDIO', mimeType: 'audio/wav', fileName: 'a.wav' };
    expect(PresignMediaBody.safeParse({ ...body, sizeBytes: MEDIA_LIMITS.AUDIO.maxBytes }).success).toBe(
      true,
    );
    expect(PresignMediaBody.safeParse({ ...body, sizeBytes: MEDIA_LIMITS.AUDIO.maxBytes + 1 }).success).toBe(
      false,
    );
  });
});

describe('tài khoản gia đình', () => {
  const classId = '00000000-0000-4000-8000-000000000001';
  const parent = { fullName: 'Nguyễn Thị Lan', phone: '0912 345 678' };

  it('RegisterFamilyBody: đăng nhập bằng mật khẩu hoặc Google, chặn hai bé trùng tên', () => {
    const child = { vietnameseName: 'Nguyễn Văn An', classId };
    const password = { type: 'password', email: 'Lan@Example.vn', password: 'secret1' };
    const ok = RegisterFamilyBody.safeParse({ credentials: password, parent, children: [child] });
    expect(ok.success && ok.data.credentials).toEqual({ ...password, email: 'lan@example.vn' });
    expect(
      RegisterFamilyBody.safeParse({
        credentials: { type: 'google', idToken: 'x' },
        parent,
        children: [child],
      }).success,
    ).toBe(true);
    // Google không kèm mật khẩu
    expect(
      RegisterFamilyBody.safeParse({
        credentials: { type: 'google', idToken: 'x', password: 'secret1' },
        parent,
        children: [child],
      }).success,
    ).toBe(false);
    const dup = RegisterFamilyBody.safeParse({
      credentials: password,
      parent,
      children: [child, { ...child, vietnameseName: 'nguyễn văn an' }],
    });
    expect(dup.error?.issues[0]?.message).toBe('duplicateChild');
    expect(RegisterFamilyBody.safeParse({ credentials: password, parent, children: [] }).success).toBe(false);
  });

  it('SetStudentGuardiansBody: đúng một người nhận học phí, không trùng phụ huynh; rỗng = gỡ hết', () => {
    const link = (guardianId: string, isBillingContact: boolean) => ({
      guardianId,
      relation: 'MOTHER',
      isBillingContact,
      receivesReports: true,
      canAccess: true,
    });
    const g1 = '00000000-0000-4000-8000-0000000000a1';
    const g2 = '00000000-0000-4000-8000-0000000000a2';
    expect(SetStudentGuardiansBody.safeParse({ guardians: [] }).success).toBe(true);
    expect(SetStudentGuardiansBody.safeParse({ guardians: [link(g1, true), link(g2, false)] }).success).toBe(
      true,
    );
    expect(
      SetStudentGuardiansBody.safeParse({ guardians: [link(g1, true), link(g2, true)] }).error?.issues[0]
        ?.message,
    ).toBe('oneBillingContact');
    expect(
      SetStudentGuardiansBody.safeParse({ guardians: [link(g1, false)] }).error?.issues[0]?.message,
    ).toBe('oneBillingContact');
    expect(
      SetStudentGuardiansBody.safeParse({ guardians: [link(g1, true), link(g1, false)] }).error?.issues[0]
        ?.message,
    ).toBe('duplicateGuardian');
  });

  it('quyền mặc định: GV duyệt tài khoản + xem liên hệ phụ huynh, PARENT không có quyền quản trị', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.TEACHER).toEqual(
      expect.arrayContaining(['families.approve', 'students.viewParentContact']),
    );
    // Quản lý phụ huynh là việc của admin (route @Roles('ADMIN')), không còn là quyền cấp được
    expect(PermissionCode.safeParse('guardians.manage').success).toBe(false);
    expect(ROLE_DEFAULT_PERMISSIONS.PARENT).toEqual([]);
  });
});

describe('học thêm', () => {
  it('ca: giờ HH:mm, kết thúc sau bắt đầu; sửa giờ phải gửi cả hai', () => {
    const body = { name: 'Phonics T3', weekday: 2, startTime: '18:00', endTime: '19:30' };
    expect(CreateExtraSlotBody.safeParse(body).success).toBe(true);
    expect(
      CreateExtraSlotBody.safeParse({ ...body, startsOn: '2026-12-01', endsOn: '2026-12-01' }).error
        ?.issues[0]?.message,
    ).toBe('slotEndsAfterStart');
    expect(CreateExtraSlotBody.safeParse({ ...body, startTime: '8:00' }).error?.issues[0]?.message).toBe(
      'timeFormat',
    );
    expect(CreateExtraSlotBody.safeParse({ ...body, endTime: '18:00' }).error?.issues[0]?.message).toBe(
      'endAfterStart',
    );
    expect(CreateExtraSlotBody.safeParse({ ...body, weekday: 8 }).success).toBe(false);
    expect(UpdateExtraSlotBody.safeParse({ startTime: '17:00' }).error?.issues[0]?.message).toBe(
      'startEndTogether',
    );
    expect(UpdateExtraSlotBody.safeParse({ room: null }).success).toBe(true);
    expect(
      UpdateExtraSlotBody.safeParse({ startTime: '17:00', endTime: '18:00', timeFrom: '2026-10-01' }).success,
    ).toBe(true);
    expect(UpdateExtraSlotBody.safeParse({ timeFrom: '2026-10-01' }).success).toBe(false);
  });

  it('học phí: khoảng tháng from ≤ to, tối đa 24 tháng', () => {
    expect(TuitionQuery.safeParse({ from: '2025-12', to: '2026-02' }).success).toBe(true);
    expect(TuitionQuery.safeParse({ from: '2026-03', to: '2026-02' }).error?.issues[0]?.message).toBe(
      'monthRange',
    );
    expect(TuitionQuery.safeParse({ from: '2024-01', to: '2026-01' }).success).toBe(false);
    expect(TuitionQuery.safeParse({ from: '2026-13', to: '2026-12' }).success).toBe(false);
    expect(monthSpan('2025-11', '2026-02')).toBe(4);
  });

  it('cài đặt học phí: mọi trường tuỳ chọn, BIN 6 số, hạn đóng 1-28, bật cột ca', () => {
    expect(UpdateTuitionSettings.safeParse({ showSlot: true }).success).toBe(true);
    expect(UpdateTuitionSettings.safeParse({}).success).toBe(true);
    expect(UpdateTuitionSettings.safeParse({ accountNo: '0123456789', dueDay: 10 }).success).toBe(true);
    expect(UpdateTuitionSettings.safeParse({ bankBin: '97043' }).error?.issues[0]?.message).toBe(
      'bankBinFormat',
    );
    expect(UpdateTuitionSettings.safeParse({ accountNo: '01-23' }).success).toBe(false);
    expect(UpdateTuitionSettings.safeParse({ dueDay: 31 }).success).toBe(false);
    expect(UpdateTuitionSettings.safeParse({ orgName: 'x', extra: 1 }).success).toBe(false);
  });

  it('lịch: ngày kết thúc phải sau ngày bắt đầu; null = học tiếp', () => {
    const slotId = '00000000-0000-4000-8000-000000000001';
    expect(
      CreateSlotAssignmentBody.safeParse({ slotId, effectiveFrom: '2026-10-01', effectiveTo: '2026-10-01' })
        .error?.issues[0]?.message,
    ).toBe('effectiveToAfterFrom');
    expect(UpdateSlotAssignmentBody.safeParse({ effectiveTo: null }).success).toBe(true);
  });

  it('sửa đơn giá: ít nhất một trường, giá trong giới hạn, không nhận ngày', () => {
    expect(UpdateExtraRateBody.safeParse({ pricePerSession: 150_000 }).success).toBe(true);
    expect(UpdateExtraRateBody.safeParse({ note: null }).success).toBe(true);
    expect(UpdateExtraRateBody.safeParse({}).error?.issues[0]?.message).toBe('atLeastOneField');
    expect(UpdateExtraRateBody.safeParse({ pricePerSession: -1 }).success).toBe(false);
    expect(UpdateExtraRateBody.safeParse({ effectiveTo: '2026-11-03' }).success).toBe(true);
    expect(UpdateExtraRateBody.safeParse({ effectiveTo: null }).success).toBe(true);
    const base = { pricePerSession: 0, effectiveFrom: '2026-11-01' };
    expect(CreateStudentRateBody.safeParse({ ...base, effectiveTo: '2026-12-01' }).success).toBe(true);
    expect(
      CreateStudentRateBody.safeParse({ ...base, effectiveTo: '2026-11-01' }).error?.issues[0]?.message,
    ).toBe('rateEndsAfterStart');
    expect(UpdateExtraRateBody.safeParse({ effectiveFrom: '2026-10-01' }).success).toBe(false);
  });

  it('quyền mặc định: GV tạo ca (phạm vi ca mình), xếp lịch + đặt giá', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.TEACHER).toEqual(
      expect.arrayContaining([
        'extra.manageSlots',
        'extra.manageSchedule',
        'extra.viewPricing',
        'extra.managePricing',
      ]),
    );
  });
});

describe('thêm học sinh (CreateStudentsBody)', () => {
  const slotId = '00000000-0000-4000-8000-000000000001';

  it('một hoặc nhiều bé, phụ huynh chung tuỳ chọn', () => {
    expect(CreateStudentsBody.safeParse({ students: [{ vietnameseName: 'Nguyễn An' }] }).success).toBe(true);
    expect(CreateStudentsBody.safeParse({ students: [] }).success).toBe(false);
    expect(
      CreateStudentsBody.safeParse({
        students: [
          { vietnameseName: 'Nguyễn An', slotId, pricePerSession: 150_000 },
          { vietnameseName: 'Nguyễn Bình', slotId, pricePerSession: 120_000 },
        ],
        effectiveFrom: '2026-11-02',
        parent: { name: 'Chị Lan', phone: '0912345678' },
      }).success,
    ).toBe(true);
  });

  it('đơn giá riêng cần ca; hai bé trùng tên bị chặn', () => {
    expect(
      CreateStudentsBody.safeParse({ students: [{ vietnameseName: 'An', pricePerSession: 1 }] }).error
        ?.issues[0]?.message,
    ).toBe('priceNeedsSlot');
    expect(
      CreateStudentsBody.safeParse({ students: [{ vietnameseName: 'An' }, { vietnameseName: 'an' }] }).error
        ?.issues[0]?.message,
    ).toBe('duplicateChild');
  });

  it('quyền mặc định: GV được thêm học sinh', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.TEACHER).toContain('students.create');
  });
});

describe('điểm danh', () => {
  const id = '00000000-0000-4000-8000-000000000001';

  it('vắng không tính phí', () => {
    expect(BILLING_POLICY).toEqual({ PRESENT: true, ABSENT: false, EXCUSED: false });
  });

  it('huỷ buổi: danh sách buổi hoặc một ngày, không cả hai', () => {
    expect(CancelAttendanceSessionsBody.safeParse({ sessionIds: [id], reason: 'Lễ' }).success).toBe(true);
    expect(CancelAttendanceSessionsBody.safeParse({ date: '2026-09-02', reason: 'Lễ' }).success).toBe(true);
    expect(
      CancelAttendanceSessionsBody.safeParse({ sessionIds: [id], date: '2026-09-02', reason: 'Lễ' }).error
        ?.issues[0]?.message,
    ).toBe('sessionsOrDate');
    expect(CancelAttendanceSessionsBody.safeParse({ reason: 'Lễ' }).success).toBe(false); // Nghỉ nhiều ngày: from ≤ to, tối đa 62 ngày; chọn ca chỉ khi huỷ theo ngày
    const tet = { date: '2027-02-04', dateTo: '2027-02-12', reason: 'Tết' };
    expect(CancelAttendanceSessionsBody.safeParse({ ...tet, slotIds: [id] }).success).toBe(true);
    expect(
      CancelAttendanceSessionsBody.safeParse({ ...tet, dateTo: '2027-02-01' }).error?.issues[0]?.message,
    ).toBe('cancelRange');
    expect(CancelAttendanceSessionsBody.safeParse({ ...tet, dateTo: '2027-04-08' }).success).toBe(false);
    expect(
      CancelAttendanceSessionsBody.safeParse({ sessionIds: [id], slotIds: [id], reason: 'x' }).error
        ?.issues[0]?.message,
    ).toBe('slotsNeedDate');
  });

  it('báo nghỉ qua mail: cần buổi và lý do', () => {
    expect(CancelDigestBody.safeParse({ sessionIds: [id], reason: 'GV ốm' }).success).toBe(true);
    expect(CancelDigestBody.safeParse({ sessionIds: [id], reason: '  ' }).success).toBe(false);
    expect(CancelDigestBody.safeParse({ sessionIds: [], reason: 'x' }).success).toBe(false);
  });

  it('sửa điểm danh: cần ít nhất một thay đổi, không trùng học sinh', () => {
    expect(UpdateAttendanceRecordsBody.safeParse({}).success).toBe(false);
    expect(UpdateAttendanceRecordsBody.safeParse({ note: null }).success).toBe(true);
    expect(
      UpdateAttendanceRecordsBody.safeParse({
        records: [
          { studentId: id, mark: 'ABSENT' },
          { studentId: id, mark: 'PRESENT' },
        ],
      }).error?.issues[0]?.message,
    ).toBe('duplicateStudent');
  });

  it('tháng YYYY-MM', () => {
    expect(StudentAttendanceQuery.safeParse({ month: '2026-11' }).success).toBe(true);
    expect(StudentAttendanceQuery.safeParse({ month: '2026-13' }).error?.issues[0]?.message).toBe(
      'monthFormat',
    );
  });
});
