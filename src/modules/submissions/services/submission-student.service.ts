import { Injectable } from '@nestjs/common';
import {
  type SaveAnswersBody,
  type SaveAnswersResponse,
  type SubmissionDetail,
  type SubmitResponse,
  collectMediaIds,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { WORKSHEETS } from '@/config/constants';
import { Prisma } from '@/generated/prisma/client';
import { AssignmentRankingService } from '@/modules/assignments/services/assignment-ranking.service';
import { AssignmentStudentService } from '@/modules/assignments/services/assignment-student.service';
import { isOpenFor } from '@/modules/assignments/utils/assignment-dates';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { MediaService } from '@/modules/media/services/media.service';
import { itemsOf } from '@/modules/worksheets/utils/worksheet-snapshot';
import { toSubmissionSummary } from '@/modules/submissions/dto/responses/submission.view';
import { gradeItem, round2, scoreOf } from '@/modules/submissions/grading/index';
import { SubmissionRepository } from '@/modules/submissions/repositories/submission.repository';
import { assertAnswersMatch, itemMapOf, snapshotOf } from '@/modules/submissions/utils/submission-rules';
import { SubmissionReaderService } from '@/modules/submissions/services/submission-reader.service';

/**
 * Học sinh làm bài (ADR 0019): start → autosave answers → submit (chấm AUTO). Điểm phiếu tách khỏi sổ điểm game;
 * hạng theo bài qua AssignmentRankingService.
 */
@Injectable()
export class SubmissionStudentService {
  constructor(
    private readonly repo: SubmissionRepository,
    private readonly reader: SubmissionReaderService,
    private readonly media: MediaService,
    private readonly assignments: AssignmentStudentService,
    private readonly ranking: AssignmentRankingService,
  ) {}

  /** Bắt đầu / tiếp tục làm bài. Advisory lock theo (bài giao, học sinh) + partial unique index chặn 2 attempt song song. */
  async start(user: AuthUser, assignmentId: string): Promise<{ created: boolean; detail: SubmissionDetail }> {
    const assignment = await this.assignments.loadForStudent(user, assignmentId);
    const now = new Date();
    if (!isOpenFor(assignment, now)) throw new AppError('ASSIGNMENT_NOT_OPEN', 409);

    const result = await this.repo.transaction(async (tx) => {
      await this.repo.lockAttempt(tx, assignmentId, user.id);
      const existing = await this.repo.findInProgress(tx, assignmentId, user.id);
      if (existing) return { created: false, row: existing };
      const attempts = await this.repo.countAttempts(tx, assignmentId, user.id);
      if (attempts >= assignment.maxAttempts) throw new AppError('ATTEMPTS_EXHAUSTED', 409);
      const row = await this.repo.create(tx, {
        assignmentId,
        studentId: user.id,
        attemptNo: attempts + 1,
        maxScore: assignment.maxScore,
        startedAt: now,
      });
      return { created: true, row };
    });
    return { created: result.created, detail: await this.reader.toDetail(result.row, { teacher: false }) };
  }

  /** Autosave: upsert theo worksheetItemId; answer phải đúng dạng câu trong snapshot; media phải READY và của học sinh */
  async saveAnswers(
    user: AuthUser,
    submissionId: string,
    body: SaveAnswersBody,
  ): Promise<SaveAnswersResponse> {
    const row = await this.reader.loadOwn(user, submissionId);
    if (row.status !== 'IN_PROGRESS') throw new AppError('SUBMISSION_NOT_EDITABLE', 409);
    if (!isOpenFor(row.assignment)) throw new AppError('ASSIGNMENT_NOT_OPEN', 409);
    const items = itemMapOf(snapshotOf(row));
    assertAnswersMatch(items, body.answers);
    await this.media.assertOwnedReady(collectMediaIds(body.answers), user);

    const updatedAt = await this.repo.transaction(async (tx) => {
      for (const a of body.answers) {
        const item = items.get(a.worksheetItemId)!;
        const answer = a.answer as Prisma.InputJsonValue;
        await this.repo.upsertAnswer(
          tx,
          { submissionId, worksheetItemId: a.worksheetItemId },
          { questionType: item.question.type, maxPoints: item.points, answer },
          { answer },
        );
      }
      return this.repo.touch(tx, submissionId);
    });
    return { saved: body.answers.length, updatedAt: updatedAt.toISOString() };
  }

  /** Nộp bài: chấm mọi câu AUTO, tính late / duration; GRADED ngay nếu không có câu chấm tay */
  async submit(user: AuthUser, submissionId: string): Promise<SubmitResponse> {
    const now = new Date();
    const row = await this.repo.transaction(async (tx) => {
      if ((await this.repo.markSubmitted(tx, submissionId, user.id)) === 0) {
        if (!(await this.repo.existsForStudent(tx, submissionId, user.id)))
          throw notFound('Không tìm thấy bài làm');
        throw new AppError('SUBMISSION_NOT_EDITABLE', 409);
      }
      const current = await this.repo.findByIdOrThrow(submissionId, tx);
      if (!isOpenFor(current.assignment, now)) throw new AppError('ASSIGNMENT_NOT_OPEN', 409);

      const byItem = new Map(current.answers.map((a) => [a.worksheetItemId, a]));
      let autoScore = 0;
      for (const item of itemsOf(snapshotOf(current))) {
        const existing = byItem.get(item.worksheetItemId);
        const manual = item.question.gradingMode === 'MANUAL';
        const result = manual ? null : gradeItem(item.question, existing?.answer ?? null);
        const score = result ? scoreOf(result, item.points) : null;
        autoScore += score ?? 0;
        const grading = {
          isCorrect: result ? result.correct : null,
          autoScore: score,
          gradeDetail: result ? (result.detail as Prisma.InputJsonValue) : Prisma.DbNull,
        };
        if (existing) await this.repo.updateAnswer(tx, existing.id, grading);
        else
          await this.repo.createAnswer(tx, {
            submissionId,
            worksheetItemId: item.worksheetItemId,
            questionType: item.question.type,
            maxPoints: item.points,
            answer: {},
            ...grading,
          });
      }
      autoScore = round2(autoScore);
      const graded = !current.assignment.hasManualItems;
      const durationMs = Math.min(
        WORKSHEETS.maxDurationMs,
        Math.max(0, now.getTime() - current.startedAt.getTime()),
      );
      return this.repo.update(tx, submissionId, {
        status: graded ? 'GRADED' : 'SUBMITTED',
        submittedAt: now,
        gradedAt: graded ? now : null,
        autoScore,
        totalScore: graded ? autoScore : null,
        durationMs,
        late: !!current.assignment.dueAt && now > current.assignment.dueAt,
      });
    });
    const rank = row.status === 'GRADED' ? await this.ranking.rankOf(row.assignmentId, user.id) : null;
    return { submission: toSubmissionSummary(row), rank };
  }
}
