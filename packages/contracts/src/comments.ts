import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { AvatarKey, Role } from './users.js';

/**
 * Nhận xét trên bài nộp: theo cả bài (`worksheetItemId` null) hoặc theo từng câu.
 * Giáo viên tạo gốc hoặc trả lời; học sinh chỉ trả lời (cần `parentId`). Một cấp lồng.
 */
export const CommentBody = z.string().trim().min(1).max(1000);

export const CreateCommentBody = z.strictObject({
  body: CommentBody,
  worksheetItemId: Id.optional(),
  /** Trả lời comment gốc; học sinh bắt buộc có */
  parentId: Id.optional(),
});
export type CreateCommentBody = z.infer<typeof CreateCommentBody>;

export const UpdateCommentBody = z.strictObject({ body: CommentBody });
export type UpdateCommentBody = z.infer<typeof UpdateCommentBody>;

const CommentBase = z.object({
  id: Id,
  submissionId: Id,
  worksheetItemId: Id.nullable(),
  authorId: Id,
  authorName: z.string(),
  authorRole: Role,
  authorAvatarKey: AvatarKey,
  parentId: Id.nullable(),
  /** "" khi đã xoá */
  body: z.string(),
  deleted: z.boolean(),
  createdAt: IsoDateTime,
  editedAt: IsoDateTime.nullable(),
});

export const CommentReply = CommentBase;
export type CommentReply = z.infer<typeof CommentReply>;

export const CommentView = CommentBase.extend({ replies: z.array(CommentReply) });
export type CommentView = z.infer<typeof CommentView>;

export const CommentsResponse = z.object({ items: z.array(CommentView) });
export type CommentsResponse = z.infer<typeof CommentsResponse>;
