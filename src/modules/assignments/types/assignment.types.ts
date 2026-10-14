import { type Prisma } from '@/generated/prisma/client';

/** Quan hệ luôn nạp kèm bài giao (tên phiếu, lớp, người giao) để dựng view */
export const assignmentInclude = {
  worksheet: { select: { title: true, subject: true, topic: true, kind: true } },
  class: { select: { name: true } },
  assignedBy: { select: { displayName: true } },
} satisfies Prisma.AssignmentInclude;

export type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

/** Một dòng thống kê nhanh của bài giao (SQL raw trong AssignmentRepository.countsFor) */
export interface AssignmentCountsRow {
  assignmentId: string;
  students: number;
  submitted: number;
  graded: number;
  pendingGrading: number;
  avgPercent: number | null;
}

/** Trường sắp xếp được phép ở GET /assignments */
export const ASSIGNMENT_SORT_FIELDS = [
  'scheduledFor',
  'createdAt',
  'dueAt',
  'status',
  'availableFrom',
] as const;
