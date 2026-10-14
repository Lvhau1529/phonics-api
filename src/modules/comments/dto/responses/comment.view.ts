import { AvatarKey, DEFAULT_AVATAR, type CommentReply, type CommentView } from '@phonics/contracts';
import { type CommentRow } from '@/modules/comments/types/comment.types';

export function toCommentReply(row: CommentRow): CommentReply {
  return {
    id: row.id,
    submissionId: row.submissionId,
    worksheetItemId: row.worksheetItemId,
    authorId: row.authorId,
    authorName: row.author.displayName,
    authorRole: row.author.role,
    authorAvatarKey: AvatarKey.safeParse(row.author.avatarKey).data ?? DEFAULT_AVATAR,
    parentId: row.parentId,
    body: row.deletedAt ? '' : row.body,
    deleted: !!row.deletedAt,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

/** Gom thành cây một cấp: gốc (parentId null) + replies theo thời gian */
export function buildThread(rows: readonly CommentRow[]): CommentView[] {
  const roots = new Map<string, CommentView>();
  for (const r of rows) if (!r.parentId) roots.set(r.id, { ...toCommentReply(r), replies: [] });
  for (const r of rows) if (r.parentId) roots.get(r.parentId)?.replies.push(toCommentReply(r));
  return [...roots.values()];
}
