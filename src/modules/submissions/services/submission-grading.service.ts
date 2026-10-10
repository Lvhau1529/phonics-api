import { Injectable } from '@nestjs/common';
import { type GradeSubmissionBody, type SubmissionDetail } from '@phonics/contracts';
import { AppError } from '../../../common/errors/app-error';
import { AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { round2 } from '../grading/index';
import { SubmissionRepository } from '../repositories/submission.repository';
import {
  assertGradesValid,
  itemMapOf,
  pendingManualItems,
  snapshotOf,
  totalOf,
} from '../utils/submission-rules';
import { SubmissionReaderService } from './submission-reader.service';

/** Giáo viên chấm bài (lớp mình): chấm tay / ghi đè điểm, chốt điểm, cho làm lại */
@Injectable()
export class SubmissionGradingService {
  constructor(
    private readonly repo: SubmissionRepository,
    private readonly reader: SubmissionReaderService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Chấm tay / ghi đè điểm từng câu; `finalize` chốt: mọi câu MANUAL phải có điểm → GRADED, tính totalScore,
   * thông báo học sinh (một lần). Bài đã GRADED mà sửa điểm thì tính lại tổng.
   */
  async grade(actor: AuthUser, submissionId: string, body: GradeSubmissionBody): Promise<SubmissionDetail> {
    const current = await this.reader.loadForTeacher(actor, submissionId);
    if (current.status === 'IN_PROGRESS') throw new AppError('SUBMISSION_NOT_SUBMITTED', 409);
    const items = itemMapOf(snapshotOf(current));
    assertGradesValid(items, body.items);

    const now = new Date();
    const wasGraded = current.status === 'GRADED';
    const row = await this.repo.transaction(async (tx) => {
      for (const g of body.items) {
        const item = items.get(g.worksheetItemId)!;
        const graded = {
          manualScore: g.manualScore,
          isCorrect: g.manualScore >= item.points,
          gradedById: actor.id,
          gradedAt: now,
        };
        await this.repo.upsertAnswer(
          tx,
          { submissionId, worksheetItemId: g.worksheetItemId },
          {
            questionType: item.question.type,
            maxPoints: item.points,
            answer: {},
            teacherNote: g.teacherNote ?? null,
            ...graded,
          },
          { ...graded, teacherNote: g.teacherNote === undefined ? undefined : g.teacherNote },
        );
      }
      if (!body.finalize && !wasGraded) return this.repo.findByIdOrThrow(submissionId, tx);

      const answers = await this.repo.answersOf(tx, submissionId);
      const pending = pendingManualItems(items, answers);
      if (pending.length)
        throw new AppError('GRADING_INCOMPLETE', 409, { details: { worksheetItemId: pending } });

      const totalScore = totalOf(answers);
      const updated = await this.repo.update(tx, submissionId, {
        status: 'GRADED',
        manualScore: round2(answers.reduce((s, a) => s + (a.manualScore ?? 0), 0)),
        totalScore,
        gradedAt: now,
        gradedById: actor.id,
      });
      if (!wasGraded) {
        await this.notifications.create(
          {
            userId: updated.studentId,
            type: 'SUBMISSION_GRADED',
            title: 'Your homework was graded!',
            body: `${snapshotOf(updated).title}: ${totalScore}/${updated.maxScore}. Great effort!`,
            data: {
              assignmentId: updated.assignmentId,
              submissionId,
              totalScore,
              maxScore: updated.maxScore,
            },
          },
          tx,
        );
      }
      return updated;
    });
    await this.audit.record(
      actor,
      'submission.grade',
      'Submission',
      submissionId,
      { status: current.status, totalScore: current.totalScore },
      { status: row.status, totalScore: row.totalScore, items: body.items.length, finalize: body.finalize },
    );
    return this.reader.toDetail(row, { teacher: true });
  }

  /** Cho học sinh làm lại: về IN_PROGRESS, xoá điểm (giữ câu trả lời) */
  async reopen(actor: AuthUser, submissionId: string): Promise<SubmissionDetail> {
    const current = await this.reader.loadForTeacher(actor, submissionId);
    if (current.status === 'IN_PROGRESS') return this.reader.toDetail(current, { teacher: true });
    const row = await this.repo.transaction(async (tx) => {
      await this.repo.clearScores(tx, submissionId);
      return this.repo.update(tx, submissionId, {
        status: 'IN_PROGRESS',
        submittedAt: null,
        gradedAt: null,
        gradedById: null,
        autoScore: 0,
        manualScore: null,
        totalScore: null,
        durationMs: null,
        late: false,
      });
    });
    await this.audit.record(
      actor,
      'submission.reopen',
      'Submission',
      submissionId,
      { status: current.status },
      { status: 'IN_PROGRESS' },
    );
    return this.reader.toDetail(row, { teacher: true });
  }
}
