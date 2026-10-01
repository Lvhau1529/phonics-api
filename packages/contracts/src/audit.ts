import { z } from 'zod';
import { IsoDate, IsoDateTime } from './common/dates';
import { Id } from './common/ids';
import { PageQuery } from './common/pagination';

/** Hành động được ghi nhật ký (xem AuditService ở API) */
export const AuditAction = z.enum([
  'student.update',
  'student.moveClass',
  'student.resetPassword',
  'teacher.create',
  'teacher.update',
  'teacher.setClasses',
  'class.create',
  'class.update',
  'class.setTeachers',
  'points.bonus',
  'permission.update',
  'game.update',
  'game.unlock',
  'game.unlockClass',
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditLogView = z.object({
  id: Id,
  actorId: Id.nullable(),
  actorName: z.string().nullable(),
  action: AuditAction,
  targetType: z.string(),
  targetId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  createdAt: IsoDateTime,
});
export type AuditLogView = z.infer<typeof AuditLogView>;

export const AuditListQuery = PageQuery.extend({
  actorId: Id.optional(),
  action: AuditAction.optional(),
  targetType: z.string().max(40).optional(),
  targetId: z.string().max(64).optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});
export type AuditListQuery = z.infer<typeof AuditListQuery>;
