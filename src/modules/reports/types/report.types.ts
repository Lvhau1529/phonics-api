import { type Prisma } from '@/generated/prisma/client';

/** File đã sinh xong, controller chỉ việc trả về */
export interface ReportFile {
  buffer: Buffer;
  filename: string;
  mime: string;
}

export const reportEntryInclude = {
  student: { select: { user: { select: { displayName: true } } } },
  createdBy: { select: { displayName: true } },
} satisfies Prisma.PointEntryInclude;
