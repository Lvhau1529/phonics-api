import { z } from 'zod';
import { ParentContact } from './auth.js';
import { IsoDate } from './common/dates.js';
import { Id } from './common/ids.js';
import { addValidationIssue } from './common/validation-messages.js';
import { AffectedSessionRef, PricePerSession } from './extra-lessons.js';
import { EnglishName, StudentDetail, VietnameseName } from './students.js';
import { AvatarKey } from './users.js';

/**
 * Một bé trong form "Thêm học sinh" (từ 1.10.0). Học sinh tạo ra là MANAGED (không email / mật khẩu), ACTIVE ngay;
 * cấp đăng nhập sau qua tài khoản gia đình của phụ huynh. GV phải chọn ít nhất lớp mình dạy hoặc ca mình dạy.
 */
export const NewStudentInput = z
  .strictObject({
    vietnameseName: VietnameseName,
    englishName: EnglishName.optional(),
    avatarKey: AvatarKey.optional(),
    /** Lớp chính (GV: lớp mình dạy) */
    classId: Id.optional(),
    /** Ca học thêm (GV: ca mình dạy), học từ `effectiveFrom` của body */
    slotId: Id.optional(),
    /** Đơn giá riêng / buổi (VND) từ `effectiveFrom`; trống = giá mặc định của ca. Cần `slotId` */
    pricePerSession: PricePerSession.optional(),
  })
  .superRefine((b, ctx) => {
    if (b.pricePerSession !== undefined && !b.slotId) addValidationIssue(ctx, ['slotId'], 'priceNeedsSlot');
  });
export type NewStudentInput = z.infer<typeof NewStudentInput>;

/** `POST /students` — một hoặc nhiều bé (anh chị em) cùng phụ huynh nhận học phí */
export const CreateStudentsBody = z
  .strictObject({
    students: z.array(NewStudentInput).min(1).max(10),
    /** Ngày bắt đầu học ca + áp đơn giá riêng; mặc định hôm nay */
    effectiveFrom: IsoDate.optional(),
    /** Phụ huynh nhận học phí: trùng email phụ huynh có sẵn thì gắn vào phụ huynh đó */
    parent: ParentContact.optional(),
  })
  .superRefine((b, ctx) => {
    const names = b.students.map((s) => s.vietnameseName.toLowerCase());
    if (new Set(names).size !== names.length) addValidationIssue(ctx, ['students'], 'duplicateChild');
  });
export type CreateStudentsBody = z.infer<typeof CreateStudentsBody>;

export const CreateStudentsResponse = z.object({
  items: z.array(StudentDetail),
  /** Buổi đã xác nhận (khi `effectiveFrom` ở quá khứ) chưa có các bé — áp qua `slot-assignments/apply` nếu cần */
  affectedSessions: z.array(AffectedSessionRef.extend({ studentId: Id })),
});
export type CreateStudentsResponse = z.infer<typeof CreateStudentsResponse>;
