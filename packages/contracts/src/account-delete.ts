import { z } from 'zod';

/**
 * Xoá hẳn học sinh / giáo viên / phụ huynh tạo nhầm (chỉ admin). Trước khi xoá admin xem `DeletePreview`: số dữ liệu
 * sẽ mất theo và lý do chặn (dữ liệu cần giữ → khoá tài khoản thay vì xoá).
 */

/** Lý do không được xoá */
export const DeleteBlocker = z.enum([
  /** Học sinh có mặt / vắng trong buổi học thêm đã xác nhận (dữ liệu học phí) */
  'confirmedAttendance',
  /** Giáo viên đã tạo câu hỏi / phiếu bài tập / bài giao */
  'authoredContent',
  /** Giáo viên đã tải lên ảnh / audio (có thể đang dùng trong câu hỏi) */
  'media',
]);
export type DeleteBlocker = z.infer<typeof DeleteBlocker>;

/** Dữ liệu sẽ bị xoá / gỡ theo (chỉ liệt kê key > 0) */
export const DeleteImpactKey = z.enum([
  'classes',
  'guardians',
  'children',
  'familyAccount',
  'gameResults',
  'pointEntries',
  'submissions',
  'attendance',
  'slotAssignments',
  'extraSlots',
  'comments',
]);
export type DeleteImpactKey = z.infer<typeof DeleteImpactKey>;

export const DeletePreview = z.object({
  canDelete: z.boolean(),
  blockers: z.array(DeleteBlocker),
  impact: z.array(z.object({ key: DeleteImpactKey, count: z.int().nonnegative() })),
});
export type DeletePreview = z.infer<typeof DeletePreview>;
