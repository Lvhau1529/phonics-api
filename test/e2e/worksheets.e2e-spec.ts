/**
 * Luồng phiếu bài tập chính: GV tạo câu hỏi → phát hành → ghép phiếu → giao lớp → HS thấy + làm + nộp (tự chấm)
 * → GV chấm tay + chốt → xếp hạng → nhận xét → HS trả lời → thống kê.
 * Cần DATABASE_URL_TEST (DB Postgres riêng, bị TRUNCATE); không có thì cả file skip. Không cần S3 (media tạo thẳng bằng prisma).
 */
import { API_PREFIX, REFRESH_TRANSPORT_HEADER } from '@phonics/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyMigrations,
  createTestApp,
  type TestApp,
  truncateAll,
  useTestDatabase,
} from '../helpers/create-test-app';

const enabled = useTestDatabase();
const PASSWORD = 'Secret123!';

describe.skipIf(!enabled)('worksheets (e2e)', () => {
  let t: TestApp;
  let teacherToken: string;
  let studentToken: string;
  let studentId: string;
  let classId: string;
  let imageId: string;
  let questionMc: string;
  let questionSpeak: string;
  let worksheetId: string;
  let assignmentId: string;
  let submissionId: string;
  let itemMc: string;
  let itemSpeak: string;
  let rootCommentId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    applyMigrations();
    t = await createTestApp();
    await truncateAll(t.prisma);
    const { PasswordService } = await import('@/modules/auth/services/password.service');
    const passwordHash = await new PasswordService().hash(PASSWORD);

    const teacher = await t.prisma.user.create({
      data: {
        email: 'teacher.ws@e2e.local',
        passwordHash,
        role: 'TEACHER',
        displayName: 'Ms. E2E',
        emailVerified: true,
      },
    });
    const cls = await t.prisma.class.create({
      data: {
        name: 'E2E-WS',
        grade: 'K',
        schoolYear: '2026-2027',
        teachers: { create: { teacherId: teacher.id } },
      },
    });
    classId = cls.id;
    const student = await t.prisma.user.create({
      data: {
        email: 'kid.ws@e2e.local',
        passwordHash,
        role: 'STUDENT',
        displayName: 'Kid WS',
        emailVerified: true,
        studentProfile: { create: { memberships: { create: { classId } } } },
      },
    });
    studentId = student.id;
    // Media READY sẵn (bỏ qua S3)
    const img = await t.prisma.mediaAsset.create({
      data: {
        ownerId: teacher.id,
        kind: 'IMAGE',
        key: `media/${teacher.id}/e2e.png`,
        url: 'https://storage.example/resources/e2e.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        status: 'READY',
        readyAt: new Date(),
      },
    });
    imageId = img.id;

    const login = async (email: string) =>
      (
        await request(t.server)
          .post(`${API_PREFIX}/auth/login`)
          .set(REFRESH_TRANSPORT_HEADER, 'body')
          .send({ email, password: PASSWORD })
          .expect(200)
      ).body.accessToken as string;
    teacherToken = await login('teacher.ws@e2e.local');
    studentToken = await login('kid.ws@e2e.local');
  });

  afterAll(async () => {
    await t?.close();
  });

  it('GV tạo + phát hành 2 câu hỏi (MULTIPLE_CHOICE có ảnh, SPEAK chấm tay)', async () => {
    const mc = await request(t.server)
      .post(`${API_PREFIX}/questions`)
      .set(auth(teacherToken))
      .send({
        type: 'MULTIPLE_CHOICE',
        instruction: 'Look and circle the correct word.',
        tags: ['Nn'],
        config: {
          type: 'MULTIPLE_CHOICE',
          imageMediaId: imageId,
          options: [
            { id: 'a', text: 'jam' },
            { id: 'b', text: 'ram' },
          ],
        },
        answerKey: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
      })
      .expect(201);
    expect(mc.body).toMatchObject({
      gradingMode: 'AUTO',
      status: 'DRAFT',
      visibility: 'SHARED',
      tags: ['nn'],
    });
    expect(mc.body.media[imageId].url).toContain('e2e.png');
    expect(mc.body.thumbnail.id).toBe(imageId);
    questionMc = mc.body.id;

    const speak = await request(t.server)
      .post(`${API_PREFIX}/questions`)
      .set(auth(teacherToken))
      .send({
        type: 'SPEAK',
        instruction: 'Say the word.',
        points: 2,
        config: { type: 'SPEAK', prompt: 'Say: jam' },
        answerKey: { type: 'SPEAK' },
      })
      .expect(201);
    expect(speak.body.gradingMode).toBe('MANUAL');
    questionSpeak = speak.body.id;

    // Media chưa tồn tại → 400 MEDIA_NOT_READY
    await request(t.server)
      .post(`${API_PREFIX}/questions`)
      .set(auth(teacherToken))
      .send({
        type: 'SPEAK',
        instruction: 'x',
        config: { type: 'SPEAK', prompt: 'x', imageMediaId: '99999999-9999-4999-8999-999999999999' },
        answerKey: { type: 'SPEAK' },
      })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('MEDIA_NOT_READY'));

    for (const id of [questionMc, questionSpeak])
      await request(t.server)
        .post(`${API_PREFIX}/questions/${id}/publish`)
        .set(auth(teacherToken))
        .expect(200);
  });

  it('GV tạo phiếu, ghép câu, phát hành (phiếu rỗng bị từ chối)', async () => {
    const ws = await request(t.server)
      .post(`${API_PREFIX}/worksheets`)
      .set(auth(teacherToken))
      .send({ title: 'Letter Nn — E2E', topic: 'Letter Nn', grade: 'K', week: 9, day: 3, kind: 'HANDOUT' })
      .expect(201);
    worksheetId = ws.body.id;
    expect(ws.body.sections).toHaveLength(1);

    await request(t.server)
      .post(`${API_PREFIX}/worksheets/${worksheetId}/publish`)
      .set(auth(teacherToken))
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('WORKSHEET_EMPTY'));

    const sectionId = ws.body.sections[0].id;
    const structured = await request(t.server)
      .put(`${API_PREFIX}/worksheets/${worksheetId}/structure`)
      .set(auth(teacherToken))
      .send({
        sections: [
          {
            id: sectionId,
            title: 'Part 1',
            instruction: 'Look and circle.',
            items: [{ questionId: questionMc }],
          },
          { title: 'Part 2', items: [{ questionId: questionSpeak, pointsOverride: 3 }] },
        ],
      })
      .expect(200);
    expect(structured.body.sections).toHaveLength(2);
    expect(structured.body.maxScore).toBe(4);
    itemMc = structured.body.sections[0].items[0].id;
    itemSpeak = structured.body.sections[1].items[0].id;

    const published = await request(t.server)
      .post(`${API_PREFIX}/worksheets/${worksheetId}/publish`)
      .set(auth(teacherToken))
      .expect(200);
    expect(published.body.status).toBe('PUBLISHED');
  });

  it('GV giao phiếu cho lớp → OPEN ngay, HS nhận thông báo và thấy bài (không có answerKey)', async () => {
    const created = await request(t.server)
      .post(`${API_PREFIX}/assignments`)
      .set(auth(teacherToken))
      .send({
        worksheetId,
        classId,
        scheduledFor: '2026-10-09',
        availableFrom: '2020-01-01T00:00:00.000Z',
        maxAttempts: 2,
      })
      .expect(201);
    assignmentId = created.body.id;
    expect(created.body).toMatchObject({
      status: 'OPEN',
      maxScore: 4,
      hasManualItems: true,
      counts: { students: 1, submitted: 0 },
    });
    expect(created.body.snapshot.sections[0].items[0].question.answerKey).toEqual({
      type: 'MULTIPLE_CHOICE',
      optionId: 'a',
    });

    const notif = await request(t.server)
      .get(`${API_PREFIX}/me/notifications`)
      .set(auth(studentToken))
      .expect(200);
    expect(notif.body.items.some((n: { type: string }) => n.type === 'ASSIGNMENT_NEW')).toBe(true);

    const list = await request(t.server)
      .get(`${API_PREFIX}/me/assignments?filter=open`)
      .set(auth(studentToken))
      .expect(200);
    expect(list.body.items[0]).toMatchObject({
      id: assignmentId,
      isOpen: true,
      canStart: true,
      attemptsUsed: 0,
    });

    const detail = await request(t.server)
      .get(`${API_PREFIX}/me/assignments/${assignmentId}`)
      .set(auth(studentToken))
      .expect(200);
    const q = detail.body.worksheet.sections[0].items[0].question;
    expect(q.config.options).toHaveLength(2);
    expect(q.answerKey).toBeUndefined();
    expect(detail.body.media[imageId]).toBeDefined();
  });

  it('HS bắt đầu, lưu câu trả lời, nộp → SUBMITTED (chờ chấm tay), điểm tự chấm 1', async () => {
    const started = await request(t.server)
      .post(`${API_PREFIX}/me/assignments/${assignmentId}/submissions`)
      .set(auth(studentToken))
      .expect(201);
    submissionId = started.body.id;
    expect(started.body.status).toBe('IN_PROGRESS');
    // Gọi lại → 200 (tái dùng)
    await request(t.server)
      .post(`${API_PREFIX}/me/assignments/${assignmentId}/submissions`)
      .set(auth(studentToken))
      .expect(200);

    await request(t.server)
      .put(`${API_PREFIX}/me/submissions/${submissionId}/answers`)
      .set(auth(studentToken))
      .send({ answers: [{ worksheetItemId: itemMc, answer: { type: 'SPEAK' } }] })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('ANSWER_TYPE_MISMATCH'));

    const saved = await request(t.server)
      .put(`${API_PREFIX}/me/submissions/${submissionId}/answers`)
      .set(auth(studentToken))
      .send({ answers: [{ worksheetItemId: itemMc, answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' } }] })
      .expect(200);
    expect(saved.body.saved).toBe(1);

    const submitted = await request(t.server)
      .post(`${API_PREFIX}/me/submissions/${submissionId}/submit`)
      .set(auth(studentToken))
      .expect(201);
    expect(submitted.body.submission).toMatchObject({
      status: 'SUBMITTED',
      autoScore: 1,
      totalScore: null,
      late: false,
    });
    expect(submitted.body.rank).toBeNull();

    // Đã nộp → không sửa được nữa
    await request(t.server)
      .put(`${API_PREFIX}/me/submissions/${submissionId}/answers`)
      .set(auth(studentToken))
      .send({ answers: [{ worksheetItemId: itemMc, answer: { type: 'MULTIPLE_CHOICE', optionId: 'b' } }] })
      .expect(409);

    const mine = await request(t.server)
      .get(`${API_PREFIX}/me/submissions/${submissionId}`)
      .set(auth(studentToken))
      .expect(200);
    expect(mine.body.pendingManual).toBe(1);
    expect(mine.body.answers.every((a: { answerKey: unknown }) => a.answerKey === null)).toBe(true);
  });

  it('GV thấy roster, chấm tay + chốt → GRADED, xếp hạng #1, HS được thông báo', async () => {
    const roster = await request(t.server)
      .get(`${API_PREFIX}/assignments/${assignmentId}/submissions`)
      .set(auth(teacherToken))
      .expect(200);
    expect(roster.body.items[0]).toMatchObject({
      studentId,
      status: 'SUBMITTED',
      pendingManual: 1,
      attempts: 1,
    });

    await request(t.server)
      .put(`${API_PREFIX}/submissions/${submissionId}/grade`)
      .set(auth(teacherToken))
      .send({ items: [], finalize: true })
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('GRADING_INCOMPLETE'));

    const graded = await request(t.server)
      .put(`${API_PREFIX}/submissions/${submissionId}/grade`)
      .set(auth(teacherToken))
      .send({
        items: [{ worksheetItemId: itemSpeak, manualScore: 2.5, teacherNote: 'Clear voice!' }],
        finalize: true,
      })
      .expect(200);
    expect(graded.body).toMatchObject({
      status: 'GRADED',
      totalScore: 3.5,
      manualScore: 2.5,
      pendingManual: 0,
    });
    expect(graded.body.answers[1]).toMatchObject({
      manualScore: 2.5,
      teacherNote: 'Clear voice!',
      answerKey: { type: 'SPEAK' },
    });

    const ranking = await request(t.server)
      .get(`${API_PREFIX}/me/assignments/${assignmentId}/ranking`)
      .set(auth(studentToken))
      .expect(200);
    expect(ranking.body.me).toMatchObject({ rank: 1, totalScore: 3.5, isMe: true });

    const notif = await request(t.server)
      .get(`${API_PREFIX}/me/notifications`)
      .set(auth(studentToken))
      .expect(200);
    expect(notif.body.items.some((n: { type: string }) => n.type === 'SUBMISSION_GRADED')).toBe(true);
  });

  it('nhận xét theo câu: GV tạo → HS trả lời → GV được thông báo; HS không tạo gốc được', async () => {
    const root = await request(t.server)
      .post(`${API_PREFIX}/submissions/${submissionId}/comments`)
      .set(auth(teacherToken))
      .send({ body: 'Great job on the word!', worksheetItemId: itemMc })
      .expect(201);
    rootCommentId = root.body.id;

    await request(t.server)
      .post(`${API_PREFIX}/me/submissions/${submissionId}/comments`)
      .set(auth(studentToken))
      .send({ body: 'hello' })
      .expect(400);

    await request(t.server)
      .post(`${API_PREFIX}/me/submissions/${submissionId}/comments`)
      .set(auth(studentToken))
      .send({ body: 'Thank you!', parentId: rootCommentId })
      .expect(201);

    const thread = await request(t.server)
      .get(`${API_PREFIX}/me/submissions/${submissionId}/comments`)
      .set(auth(studentToken))
      .expect(200);
    expect(thread.body.items).toHaveLength(1);
    expect(thread.body.items[0].replies[0]).toMatchObject({ body: 'Thank you!', authorRole: 'STUDENT' });

    const teacherNotif = await request(t.server)
      .get(`${API_PREFIX}/me/notifications`)
      .set(auth(teacherToken))
      .expect(200);
    expect(teacherNotif.body.items.some((n: { type: string }) => n.type === 'COMMENT_REPLY')).toBe(true);
  });

  it('thống kê: bài giao, lớp, học sinh; xuất xlsx', async () => {
    const stats = await request(t.server)
      .get(`${API_PREFIX}/assignments/${assignmentId}/stats`)
      .set(auth(teacherToken))
      .expect(200);
    expect(stats.body).toMatchObject({ students: 1, submitted: 1, graded: 1, missing: 0 });
    expect(stats.body.items).toHaveLength(2);
    expect(stats.body.items[0]).toMatchObject({ type: 'MULTIPLE_CHOICE', correct: 1, answered: 1 });

    const mine = await request(t.server)
      .get(`${API_PREFIX}/me/worksheet-stats`)
      .set(auth(studentToken))
      .expect(200);
    expect(mine.body).toMatchObject({ done: 1, missing: 0 });
    expect(mine.body.recent[0]).toMatchObject({ assignmentId, rank: 1 });

    const cls = await request(t.server)
      .get(`${API_PREFIX}/worksheet-stats/classes/${classId}/overview`)
      .set(auth(teacherToken))
      .expect(200);
    expect(cls.body.assignments).toBe(1);

    const xlsx = await request(t.server)
      .get(`${API_PREFIX}/reports/assignments/${assignmentId}/results.xlsx`)
      .set(auth(teacherToken))
      .expect(200);
    expect(xlsx.headers['content-disposition']).toContain('.xlsx');
  });

  it('bài giao đã có bài nộp: không xoá được, đóng được; HS không còn bắt đầu được', async () => {
    await request(t.server)
      .delete(`${API_PREFIX}/assignments/${assignmentId}`)
      .set(auth(teacherToken))
      .expect(409);
    const closed = await request(t.server)
      .post(`${API_PREFIX}/assignments/${assignmentId}/close`)
      .set(auth(teacherToken))
      .expect(200);
    expect(closed.body.status).toBe('CLOSED');
    await request(t.server)
      .post(`${API_PREFIX}/me/assignments/${assignmentId}/submissions`)
      .set(auth(studentToken))
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('ASSIGNMENT_NOT_OPEN'));
  });
});
