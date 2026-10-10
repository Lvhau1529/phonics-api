import { Injectable } from '@nestjs/common';
import { MANUAL_TYPES, type SubmissionDetail, collectMediaIds } from '@phonics/contracts';
import { notFound } from '../../../common/errors/app-error';
import { AccessService } from '../../../core/access/access.service';
import { type Tx } from '../../../database/types';
import { type AuthUser } from '../../auth/types/auth.types';
import { MediaService } from '../../media/services/media.service';
import { itemsOf, stripAnswerKeys } from '../../worksheets/utils/worksheet-snapshot';
import { toAnswerView, toSubmissionSummary } from '../dto/responses/submission.view';
import { SubmissionRepository } from '../repositories/submission.repository';
import { type SubmissionRow } from '../types/submission.types';
import { snapshotOf } from '../utils/submission-rules';

const MANUAL = new Set<string>(MANUAL_TYPES);

/** Nạp bài nộp theo vai trò (học sinh: của mình; GV: lớp mình) và dựng SubmissionDetail */
@Injectable()
export class SubmissionReaderService {
  constructor(
    private readonly repo: SubmissionRepository,
    private readonly access: AccessService,
    private readonly media: MediaService,
  ) {}

  async loadOwn(user: AuthUser, submissionId: string): Promise<SubmissionRow> {
    const row = await this.repo.findOwn(submissionId, user.id);
    if (!row) throw notFound('Không tìm thấy bài làm');
    return row;
  }

  async loadForTeacher(user: AuthUser, submissionId: string): Promise<SubmissionRow> {
    const row = await this.repo.findById(submissionId);
    if (!row) throw notFound('Không tìm thấy bài làm');
    await this.access.assertClassAccess(user, row.assignment.classId);
    return row;
  }

  async getForStudent(user: AuthUser, submissionId: string): Promise<SubmissionDetail> {
    return this.toDetail(await this.loadOwn(user, submissionId), { teacher: false });
  }

  async getForTeacher(user: AuthUser, submissionId: string): Promise<SubmissionDetail> {
    return this.toDetail(await this.loadForTeacher(user, submissionId), { teacher: true });
  }

  /**
   * Chi tiết bài nộp: GV luôn thấy đáp án; học sinh chỉ thấy khi bài đã GRADED và bài giao bật
   * showAnswersAfterSubmit (phiếu gửi cho học sinh luôn bỏ answerKey).
   */
  async toDetail(row: SubmissionRow, opts: { teacher: boolean }, tx?: Tx): Promise<SubmissionDetail> {
    const snapshot = snapshotOf(row);
    const showKeys = opts.teacher || (row.status === 'GRADED' && row.assignment.showAnswersAfterSubmit);
    const byItem = new Map(row.answers.map((a) => [a.worksheetItemId, a]));
    const answers = itemsOf(snapshot).map((item) =>
      toAnswerView(item, byItem.get(item.worksheetItemId), showKeys),
    );
    const worksheet = opts.teacher ? snapshot : stripAnswerKeys(snapshot);
    const media = await this.media.hydrate(
      [...collectMediaIds(worksheet), ...row.answers.flatMap((a) => collectMediaIds(a.answer))],
      tx,
    );
    const pendingManual = row.answers.filter(
      (a) => MANUAL.has(a.questionType) && a.manualScore == null,
    ).length;
    return { ...toSubmissionSummary(row), answers, worksheet, media, pendingManual };
  }
}
