import { z } from 'zod';
import { IsoDateTime } from './common/dates';
import { Id } from './common/ids';
import { PageQuery } from './common/pagination';
import { AvatarKey, DisplayName, Email } from './users';

export const ClassName = z.string().trim().min(1).max(60);
export const Grade = z.string().trim().min(1).max(20);
export const SchoolYear = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, 'Năm học dạng 2026-2027');

/** Lớp hiện ở form đăng ký của học sinh (public) */
export const PublicClass = z.object({
  id: Id,
  name: ClassName,
  grade: Grade,
  schoolYear: SchoolYear,
});
export type PublicClass = z.infer<typeof PublicClass>;

export const PublicClassesResponse = z.object({ items: z.array(PublicClass) });
export type PublicClassesResponse = z.infer<typeof PublicClassesResponse>;

export const TeacherRef = z.object({ id: Id, displayName: DisplayName, email: Email, avatarKey: AvatarKey });
export type TeacherRef = z.infer<typeof TeacherRef>;

export const ClassSummary = PublicClass.extend({
  joinVisible: z.boolean(),
  archivedAt: IsoDateTime.nullable(),
  studentCount: z.int().min(0),
  teachers: z.array(TeacherRef),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ClassSummary = z.infer<typeof ClassSummary>;

export const ClassListQuery = PageQuery.extend({
  grade: Grade.optional(),
  schoolYear: SchoolYear.optional(),
  /** Mặc định chỉ lớp đang hoạt động */
  archived: z.coerce.boolean().optional(),
});
export type ClassListQuery = z.infer<typeof ClassListQuery>;

export const CreateClassBody = z.strictObject({
  name: ClassName,
  grade: Grade,
  schoolYear: SchoolYear,
  joinVisible: z.boolean().default(true),
  teacherIds: z.array(Id).max(20).default([]),
});
export type CreateClassBody = z.infer<typeof CreateClassBody>;

export const UpdateClassBody = z
  .strictObject({
    name: ClassName,
    grade: Grade,
    schoolYear: SchoolYear,
    joinVisible: z.boolean(),
    /** true = lưu trữ (ẩn khỏi danh sách), false = mở lại */
    archived: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Cần ít nhất một trường' });
export type UpdateClassBody = z.infer<typeof UpdateClassBody>;

export const SetClassTeachersBody = z.strictObject({ teacherIds: z.array(Id).max(20) });
export type SetClassTeachersBody = z.infer<typeof SetClassTeachersBody>;
