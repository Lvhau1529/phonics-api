import { type Prisma } from '../../../generated/prisma/client';

export const pointEntryInclude = {
  student: { select: { user: { select: { displayName: true } } } },
  class: { select: { name: true } },
  createdBy: { select: { displayName: true } },
} satisfies Prisma.PointEntryInclude;

export type PointEntryRow = Prisma.PointEntryGetPayload<{ include: typeof pointEntryInclude }>;

/** Dữ liệu một bút toán điểm thưởng (BONUS) */
export interface BonusEntryInput {
  studentId: string;
  classId: string;
  gameId?: string | null;
  points: number;
  note?: string | null;
  createdById: string;
}
