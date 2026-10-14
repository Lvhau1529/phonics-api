import { dayjs, ISO_DATE } from '@/core/time/dayjs';

/** Hàm thuần về ngày / cửa sổ thời gian của bài giao — dùng chung cho assignments, submissions, worksheet-stats */

/** Cột DATE: Prisma trao đổi Date ở 00:00 UTC */
export const dateOnly = (iso: string): Date => dayjs.utc(iso).toDate();
export const isoDateOf = (d: Date): string => dayjs.utc(d).format(ISO_DATE);

export interface AssignmentWindow {
  status: 'SCHEDULED' | 'OPEN' | 'CLOSED';
  availableFrom: Date;
  dueAt: Date | null;
  allowLate: boolean;
}

/** "Đang mở" tính tại request (AssignmentsScheduler chỉ đổi status, có thể trễ vài giây): status OPEN và trong cửa sổ thời gian */
export function isOpenFor(a: AssignmentWindow, now: Date = new Date()): boolean {
  if (a.status !== 'OPEN') return false;
  if (now < a.availableFrom) return false;
  if (a.dueAt && now >= a.dueAt && !a.allowLate) return false;
  return true;
}

/** Trạng thái khi (mở lại / đổi giờ mở) bài chưa đóng: tới giờ thì OPEN, chưa tới thì SCHEDULED */
export const statusByWindow = (availableFrom: Date, now: Date): 'OPEN' | 'SCHEDULED' =>
  availableFrom <= now ? 'OPEN' : 'SCHEDULED';
