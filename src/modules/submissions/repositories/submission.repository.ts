import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { type Tx } from '../../../database/types';
import { Prisma } from '../../../generated/prisma/client';
import {
  type SubmissionAnswerRow,
  type SubmissionRow,
  submissionDetailInclude,
} from '../types/submission.types';

/** Dữ liệu ghi cho một câu trả lời (theo bài nộp + worksheetItemId) */
export interface AnswerKey {
  submissionId: string;
  worksheetItemId: string;
}

/** Mọi truy vấn Prisma của bài nộp (submissions, submission_answers) */
@Injectable()
export class SubmissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // ---------- đọc ----------

  findById(id: string, db: Tx = this.prisma): Promise<SubmissionRow | null> {
    return db.submission.findUnique({ where: { id }, include: submissionDetailInclude });
  }

  findByIdOrThrow(id: string, db: Tx = this.prisma): Promise<SubmissionRow> {
    return db.submission.findUniqueOrThrow({ where: { id }, include: submissionDetailInclude });
  }

  /** Bài nộp của chính học sinh */
  findOwn(id: string, studentId: string): Promise<SubmissionRow | null> {
    return this.prisma.submission.findFirst({ where: { id, studentId }, include: submissionDetailInclude });
  }

  async existsForStudent(tx: Tx, id: string, studentId: string): Promise<boolean> {
    return !!(await tx.submission.findFirst({ where: { id, studentId }, select: { id: true } }));
  }

  findInProgress(tx: Tx, assignmentId: string, studentId: string): Promise<SubmissionRow | null> {
    return tx.submission.findFirst({
      where: { assignmentId, studentId, status: 'IN_PROGRESS' },
      include: submissionDetailInclude,
    });
  }

  countAttempts(tx: Tx, assignmentId: string, studentId: string): Promise<number> {
    return tx.submission.count({ where: { assignmentId, studentId } });
  }

  answersOf(tx: Tx, submissionId: string): Promise<SubmissionAnswerRow[]> {
    return tx.submissionAnswer.findMany({ where: { submissionId } });
  }

  // ---------- ghi bài nộp ----------

  /** Khoá theo (bài giao, học sinh) trong transaction — chặn 2 attempt song song */
  async lockAttempt(tx: Tx, assignmentId: string, studentId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${assignmentId}:${studentId}`}))`;
  }

  create(tx: Tx, data: Prisma.SubmissionUncheckedCreateInput): Promise<SubmissionRow> {
    return tx.submission.create({ data, include: submissionDetailInclude });
  }

  update(tx: Tx, id: string, data: Prisma.SubmissionUncheckedUpdateInput): Promise<SubmissionRow> {
    return tx.submission.update({ where: { id }, data, include: submissionDetailInclude });
  }

  /** Đổi IN_PROGRESS → SUBMITTED nếu đúng chủ; trả số dòng đổi (0 = không phải bài đang làm của học sinh) */
  async markSubmitted(tx: Tx, id: string, studentId: string): Promise<number> {
    const { count } = await tx.submission.updateMany({
      where: { id, studentId, status: 'IN_PROGRESS' },
      data: { status: 'SUBMITTED' },
    });
    return count;
  }

  /** Cập nhật updatedAt (autosave) */
  async touch(tx: Tx, id: string): Promise<Date> {
    const row = await tx.submission.update({
      where: { id },
      data: { updatedAt: new Date() },
      select: { updatedAt: true },
    });
    return row.updatedAt;
  }

  // ---------- ghi câu trả lời ----------

  async upsertAnswer(
    tx: Tx,
    key: AnswerKey,
    create: Omit<Prisma.SubmissionAnswerUncheckedCreateInput, 'submissionId' | 'worksheetItemId'>,
    update: Prisma.SubmissionAnswerUncheckedUpdateInput,
  ): Promise<void> {
    await tx.submissionAnswer.upsert({
      where: { submissionId_worksheetItemId: key },
      create: { ...key, ...create },
      update,
    });
  }

  async updateAnswer(
    tx: Tx,
    answerId: string,
    data: Prisma.SubmissionAnswerUncheckedUpdateInput,
  ): Promise<void> {
    await tx.submissionAnswer.update({ where: { id: answerId }, data });
  }

  async createAnswer(tx: Tx, data: Prisma.SubmissionAnswerUncheckedCreateInput): Promise<void> {
    await tx.submissionAnswer.create({ data });
  }

  /** Xoá mọi điểm của bài (cho làm lại); giữ câu trả lời */
  async clearScores(tx: Tx, submissionId: string): Promise<void> {
    await tx.submissionAnswer.updateMany({
      where: { submissionId },
      data: {
        autoScore: null,
        manualScore: null,
        isCorrect: null,
        gradeDetail: Prisma.DbNull,
        gradedAt: null,
        gradedById: null,
      },
    });
  }
}
