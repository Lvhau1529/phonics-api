import { Injectable } from '@nestjs/common';
import {
  type CommentsResponse,
  type CommentView,
  type CreateCommentBody,
  type UpdateCommentBody,
  type WorksheetSnapshot,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { PrismaService } from '@/database/prisma.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { NotificationsService } from '@/modules/notifications/services/notifications.service';
import { itemsOf } from '@/modules/worksheets/utils/worksheet-snapshot';
import { buildThread, toCommentReply } from '@/modules/comments/dto/responses/comment.view';
import { commentInclude, CommentRow } from '@/modules/comments/types/comment.types';

/**
 * Nhận xét trên bài nộp (theo bài hoặc theo câu). GV (lớp mình) tạo gốc / trả lời; học sinh chỉ trả lời trên bài của
 * mình. Thông báo COMMENT_REPLY cho đối phương. Xoá mềm.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, submissionId: string): Promise<CommentsResponse> {
    await this.loadSubmission(user, submissionId);
    const rows = await this.prisma.comment.findMany({
      where: { submissionId },
      orderBy: { createdAt: 'asc' },
      include: commentInclude,
    });
    return { items: buildThread(rows) };
  }

  async create(user: AuthUser, submissionId: string, body: CreateCommentBody): Promise<CommentView> {
    const submission = await this.loadSubmission(user, submissionId);
    const isStudent = user.role === 'STUDENT';
    if (isStudent && !body.parentId)
      throw new AppError('VALIDATION_ERROR', 400, {
        fieldErrors: { parentId: ['studentRepliesOnly'] },
      });
    if (isStudent && submission.status === 'IN_PROGRESS') throw new AppError('SUBMISSION_NOT_SUBMITTED', 409);

    let parent: CommentRow | null = null;
    let worksheetItemId = body.worksheetItemId ?? null;
    if (body.parentId) {
      parent = await this.prisma.comment.findFirst({
        where: { id: body.parentId, submissionId, deletedAt: null },
        include: commentInclude,
      });
      if (!parent) throw notFound('parentCommentNotFound');
      // Chỉ lồng một cấp: trả lời một reply → gắn vào gốc của nó
      if (parent.parentId) {
        parent = await this.prisma.comment.findUniqueOrThrow({
          where: { id: parent.parentId },
          include: commentInclude,
        });
      }
      worksheetItemId = parent.worksheetItemId;
    } else if (worksheetItemId) {
      const snapshot = submission.assignment.snapshot as unknown as WorksheetSnapshot;
      if (!itemsOf(snapshot).some((it) => it.worksheetItemId === worksheetItemId))
        throw new AppError('VALIDATION_ERROR', 400, {
          fieldErrors: { worksheetItemId: ['itemNotInSubmission'] },
        });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          submissionId,
          worksheetItemId,
          authorId: user.id,
          parentId: parent?.id ?? null,
          body: body.body,
        },
        include: commentInclude,
      });
      const title = (submission.assignment.snapshot as unknown as WorksheetSnapshot).title;
      const data = {
        assignmentId: submission.assignmentId,
        submissionId,
        commentId: created.id,
        worksheetItemId,
      };
      if (isStudent) {
        if (parent && parent.authorId !== user.id) {
          await this.notifications.create(
            {
              userId: parent.authorId,
              type: 'COMMENT_REPLY',
              title: 'A student replied',
              body: `${created.author.displayName}: ${excerpt(body.body)}`,
              data,
            },
            tx,
          );
        }
      } else if (submission.studentId !== user.id) {
        await this.notifications.create(
          {
            userId: submission.studentId,
            type: 'COMMENT_REPLY',
            title: 'Your teacher left a comment',
            body: `${title}: ${excerpt(body.body)}`,
            data,
          },
          tx,
        );
      }
      return created;
    });
    return { ...toCommentReply(row), replies: [] };
  }

  /** Chỉ tác giả sửa được */
  async update(user: AuthUser, id: string, body: UpdateCommentBody): Promise<CommentView> {
    const current = await this.prisma.comment.findUnique({ where: { id }, include: commentInclude });
    if (!current || current.deletedAt) throw notFound('commentNotFound');
    if (current.authorId !== user.id) throw new AppError('FORBIDDEN_SCOPE', 403);
    const row = await this.prisma.comment.update({
      where: { id },
      data: { body: body.body, editedAt: new Date() },
      include: commentInclude,
    });
    const replies = await this.prisma.comment.findMany({
      where: { parentId: id },
      orderBy: { createdAt: 'asc' },
      include: commentInclude,
    });
    return { ...toCommentReply(row), replies: replies.map(toCommentReply) };
  }

  /** Tác giả hoặc admin; xoá mềm (giữ cây) */
  async remove(user: AuthUser, id: string): Promise<void> {
    const current = await this.prisma.comment.findUnique({ where: { id } });
    if (!current || current.deletedAt) throw notFound('commentNotFound');
    if (current.authorId !== user.id && user.role !== 'ADMIN') throw new AppError('FORBIDDEN_SCOPE', 403);
    await this.prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
    if (user.role === 'ADMIN' && current.authorId !== user.id)
      await this.audit.record(
        user,
        'comment.delete',
        'Comment',
        id,
        { authorId: current.authorId, body: current.body },
        null,
      );
  }

  /** Học sinh: bài của mình; GV: lớp mình; ADMIN: tất cả */
  private async loadSubmission(user: AuthUser, submissionId: string) {
    const row = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        studentId: true,
        status: true,
        assignmentId: true,
        assignment: { select: { classId: true, snapshot: true } },
      },
    });
    if (!row) throw notFound('submissionNotFound');
    if (user.role === 'STUDENT') {
      if (row.studentId !== user.id) throw notFound('submissionNotFound');
    } else {
      await this.access.assertClassAccess(user, row.assignment.classId);
    }
    return row;
  }
}

function excerpt(text: string): string {
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}
