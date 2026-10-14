import { type Prisma } from '@/generated/prisma/client';

/** Include chuẩn để dựng TeacherSummary: các lớp đang dạy */
export const teacherInclude = {
  teachingClasses: {
    select: { class: { select: { id: true, name: true, grade: true, schoolYear: true } } },
    orderBy: [{ class: { schoolYear: 'desc' } }, { class: { name: 'asc' } }],
  },
} satisfies Prisma.UserInclude;

export type TeacherRow = Prisma.UserGetPayload<{ include: typeof teacherInclude }>;

export const TEACHER_SORT_FIELDS = ['displayName', 'email', 'status', 'createdAt', 'lastLoginAt'] as const;
