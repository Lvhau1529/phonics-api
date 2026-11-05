import { type DownloadFile } from '@/common/utils/streamable';
import { type Prisma } from '@/generated/prisma/client';

/** File đã sinh xong, controller chỉ việc trả về (`toStreamable` của common) */
export type ReportFile = DownloadFile;

export const reportEntryInclude = {
  student: { select: { user: { select: { displayName: true } } } },
  createdBy: { select: { displayName: true } },
} satisfies Prisma.PointEntryInclude;
