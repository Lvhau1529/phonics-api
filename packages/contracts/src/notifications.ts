import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';

export const NotificationType = z.enum([
  'BONUS_AWARDED',
  'RANK_CHANGED',
  'CLASS_CHANGED',
  'GAME_UNLOCKED',
  'SYSTEM',
]);
export type NotificationType = z.infer<typeof NotificationType>;

export const NotificationView = z.object({
  id: Id,
  type: NotificationType,
  /** Tiếng Anh ngắn gọn cho bé (game hiện nguyên văn) */
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  readAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type NotificationView = z.infer<typeof NotificationView>;

export const NotificationListQuery = PageQuery.pick({ page: true, pageSize: true }).extend({
  unread: z.coerce.boolean().optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuery>;

export const NotificationListResponse = z.object({
  items: z.array(NotificationView),
  total: z.int().min(0),
  page: z.int().min(1),
  pageSize: z.int().min(1),
  unreadCount: z.int().min(0),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponse>;

/** Không có ids = đánh dấu tất cả đã đọc */
export const MarkReadBody = z.strictObject({ ids: z.array(Id).min(1).max(200).optional() });
export type MarkReadBody = z.infer<typeof MarkReadBody>;

export const MarkReadResponse = z.object({ updated: z.int().min(0), unreadCount: z.int().min(0) });
export type MarkReadResponse = z.infer<typeof MarkReadResponse>;
