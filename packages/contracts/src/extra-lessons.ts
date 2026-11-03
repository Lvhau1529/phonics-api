import { z } from 'zod';
import { TeacherRef } from './classes.js';
import { IsoDate, IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { addValidationIssue, ValidationMessage } from './common/validation-messages.js';
import { EnglishName, VietnameseName } from './students.js';
import { AvatarKey, DisplayName, StudentClassRef } from './users.js';

/**
 * Học thêm (docs/attendance-design.md §4, §6): **ca học thêm** định kỳ hằng tuần, độc lập với lớp chính; mỗi học sinh
 * tự có lịch (các ca mình học, từ ngày… đến ngày…); **đơn giá / buổi** có lịch sử theo phạm vi học sinh / ca.
 * Ngày là `YYYY-MM-DD`, giờ `HH:mm`, đều theo APP_TIMEZONE. Khoảng ngày nửa mở: `effectiveFrom <= d < effectiveTo`.
 */

/** ISO weekday: 1 = Thứ Hai … 7 = Chủ nhật */
export const Weekday = z.int().min(1).max(7);
export type Weekday = z.infer<typeof Weekday>;

export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, ValidationMessage.timeFormat);
export type TimeOfDay = z.infer<typeof TimeOfDay>;

/** Đơn giá một buổi (VND, số nguyên) */
export const PricePerSession = z.int().min(0).max(10_000_000);

export const SlotName = z.string().trim().min(1).max(80);

/**
 * Loại ca: `EXTRA_CLASS` học thêm (lớp riêng), `TUTORING` kèm cuối buổi (GV kèm sau giờ học chính). Điểm danh như
 * nhau; phiếu học phí của kèm cuối buổi chỉ liệt kê buổi có học, không cột điểm danh.
 */
export const ExtraSlotKind = z.enum(['EXTRA_CLASS', 'TUTORING']);
export type ExtraSlotKind = z.infer<typeof ExtraSlotKind>;

/** Ca rút gọn (lịch của học sinh, chọn ca) */
export const ExtraSlotRef = z.object({
  id: Id,
  name: SlotName,
  /** Từ 1.17.0 */
  kind: ExtraSlotKind,
  weekday: Weekday,
  startTime: TimeOfDay,
  endTime: TimeOfDay,
  /** Ngày đầu tiên có buổi (null = ngay từ lúc tạo ca) */
  startsOn: IsoDate.nullable(),
  /** Ngừng ca từ ngày này — ngày này trở đi không còn buổi (null = chưa định ngày ngừng) */
  endsOn: IsoDate.nullable(),
  /** Ca đã ngừng (tới `endsOn` hoặc bấm ngừng ngay) — ẩn khỏi danh sách mặc định */
  archivedAt: IsoDateTime.nullable(),
});
export type ExtraSlotRef = z.infer<typeof ExtraSlotRef>;

/** Nguồn đơn giá áp dụng (§4.1): riêng HS ở ca → riêng HS → mặc định ca → chưa có (0đ + cảnh báo) */
export const RateSource = z.enum(['STUDENT_SLOT', 'STUDENT', 'SLOT', 'NONE']);
export type RateSource = z.infer<typeof RateSource>;

export const AppliedRate = z.object({
  pricePerSession: PricePerSession,
  source: RateSource,
  rateId: Id.nullable(),
  /** Ngày đầu tiên dòng giá này hết hiệu lực (ưu đãi có hạn) — null khi không hạn (từ 1.16.0; API cũ không có) */
  effectiveTo: IsoDate.nullable().optional(),
});
export type AppliedRate = z.infer<typeof AppliedRate>;

export const ExtraSlot = ExtraSlotRef.extend({
  room: z.string().nullable(),
  capacity: z.int().min(1).nullable(),
  /** Lớp chính tham khảo (để lọc), không bắt buộc */
  class: z.object({ id: Id, name: z.string() }).nullable(),
  teachers: z.array(TeacherRef),
  /** Số học sinh đang học ca (tính đến hôm nay) */
  studentCount: z.int().min(0),
  /** Giá mặc định đang áp dụng — null khi chưa đặt hoặc người xem không có quyền extra.viewPricing */
  defaultPrice: PricePerSession.nullable(),
  /** Ngày có buổi kế tiếp (từ hôm nay, bỏ qua ngày đã huỷ trước) — null khi ca đã / sắp ngừng không còn buổi */
  nextSessionDate: IsoDate.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ExtraSlot = z.infer<typeof ExtraSlot>;

export const ExtraSlotListQuery = z.object({
  includeArchived: z.enum(['true', 'false']).optional(),
  teacherId: Id.optional(),
  classId: Id.optional(),
});
export type ExtraSlotListQuery = z.infer<typeof ExtraSlotListQuery>;

export const ExtraSlotsResponse = z.object({ items: z.array(ExtraSlot) });
export type ExtraSlotsResponse = z.infer<typeof ExtraSlotsResponse>;

const slotFields = {
  name: SlotName,
  kind: ExtraSlotKind,
  weekday: Weekday,
  startTime: TimeOfDay,
  endTime: TimeOfDay,
  room: z.string().trim().max(40),
  capacity: z.int().min(1).max(200),
  classId: Id,
  startsOn: IsoDate,
  endsOn: IsoDate,
};

function endAfterStart(
  b: { startTime?: string; endTime?: string; startsOn?: string | null; endsOn?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (b.startTime && b.endTime && b.endTime <= b.startTime)
    addValidationIssue(ctx, ['endTime'], 'endAfterStart');
  if (b.startsOn && b.endsOn && b.endsOn <= b.startsOn)
    addValidationIssue(ctx, ['endsOn'], 'slotEndsAfterStart');
}

export const CreateExtraSlotBody = z
  .strictObject({
    ...slotFields,
    kind: slotFields.kind.optional(),
    room: slotFields.room.optional(),
    capacity: slotFields.capacity.optional(),
    classId: slotFields.classId.optional(),
    startsOn: slotFields.startsOn.optional(),
    endsOn: slotFields.endsOn.optional(),
    teacherIds: z.array(Id).max(5).optional(),
  })
  .superRefine(endAfterStart);
export type CreateExtraSlotBody = z.infer<typeof CreateExtraSlotBody>;

/**
 * `null` = xoá giá trị. Sửa một trong hai giờ thì gửi cả hai; giờ mới áp cho cả buổi đã tạo từ ngày `timeFrom`
 * (mặc định hôm nay, mọi trạng thái — không ảnh hưởng tiền). Loại ca mới áp cho mọi buổi đã tạo của ca. Đổi thứ không dời buổi đã tạo.
 * Đặt `endsOn`: học sinh đang học rời ca từ ngày đó, buổi chưa xác nhận từ ngày đó bị huỷ; `endsOn` ≤ hôm nay = ngừng
 * ngay. `endsOn: null` chỉ bỏ ngày ngừng (học sinh đã cho rời ca không tự quay lại).
 */
export const UpdateExtraSlotBody = z
  .strictObject({
    ...slotFields,
    room: slotFields.room.nullable(),
    capacity: slotFields.capacity.nullable(),
    classId: slotFields.classId.nullable(),
    startsOn: slotFields.startsOn.nullable(),
    endsOn: slotFields.endsOn.nullable(),
    timeFrom: IsoDate,
  })
  .partial()
  .refine((b) => Object.keys(b).some((k) => k !== 'timeFrom'), ValidationMessage.atLeastOneField)
  .refine((b) => (b.startTime === undefined) === (b.endTime === undefined), {
    message: ValidationMessage.startEndTogether,
    path: ['endTime'],
  })
  .superRefine(endAfterStart);
export type UpdateExtraSlotBody = z.infer<typeof UpdateExtraSlotBody>;

export const SetSlotTeachersBody = z.strictObject({ teacherIds: z.array(Id).max(5) });
export type SetSlotTeachersBody = z.infer<typeof SetSlotTeachersBody>;

/** Buổi đã xác nhận lệch với lịch mới (định nghĩa lại `AffectedSession` của attendance.ts để tránh import vòng) */
export const AffectedSessionRef = z.object({
  sessionId: Id,
  date: IsoDate,
  slotName: z.string().nullable(),
  change: z.enum(['ADD', 'REMOVE']),
});

/** Bản ghi đã xác nhận có đơn giá khác giá mới */
export const AffectedRecordRef = z.object({
  sessionId: Id,
  studentId: Id,
  date: IsoDate,
  oldPrice: PricePerSession,
  newPrice: PricePerSession,
  charged: z.boolean(),
});

// ---------- Lịch học của học sinh ----------

/** Một dòng lịch: học sinh học ca `slot` trong `[effectiveFrom, effectiveTo)` */
export const SlotAssignment = z.object({
  id: Id,
  studentId: Id,
  slot: ExtraSlotRef,
  effectiveFrom: IsoDate,
  /** null = đang học; ngày đầu tiên KHÔNG học nữa */
  effectiveTo: IsoDate.nullable(),
  note: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /**
   * Chỉ có ở response tạo / sửa / chuyển (từ 1.9.0): buổi đã xác nhận lệch với lịch mới — hỏi người dùng rồi gọi
   * `slot-assignments/apply`. Buổi chưa xác nhận đã tự đồng bộ.
   */
  affectedSessions: z.array(AffectedSessionRef).optional(),
});
export type SlotAssignment = z.infer<typeof SlotAssignment>;

function toAfterFrom(b: { effectiveFrom?: string; effectiveTo?: string | null }, ctx: z.RefinementCtx): void {
  if (b.effectiveFrom && b.effectiveTo && b.effectiveTo <= b.effectiveFrom) {
    addValidationIssue(ctx, ['effectiveTo'], 'effectiveToAfterFrom');
  }
}

const AssignmentNote = z.string().trim().max(200);

/** Thêm học sinh vào ca từ ngày X (X có thể ở quá khứ) */
export const CreateSlotAssignmentBody = z
  .strictObject({
    slotId: Id,
    effectiveFrom: IsoDate,
    effectiveTo: IsoDate.optional(),
    note: AssignmentNote.optional(),
  })
  .superRefine(toAfterFrom);
export type CreateSlotAssignmentBody = z.infer<typeof CreateSlotAssignmentBody>;

/** Sửa ngày (nhập sai) hoặc cho rời ca từ ngày Y (`effectiveTo`); `effectiveTo: null` = học tiếp */
export const UpdateSlotAssignmentBody = z
  .strictObject({
    effectiveFrom: IsoDate,
    effectiveTo: IsoDate.nullable(),
    note: AssignmentNote.nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, ValidationMessage.atLeastOneField)
  .superRefine(toAfterFrom);
export type UpdateSlotAssignmentBody = z.infer<typeof UpdateSlotAssignmentBody>;

/** Chuyển sang ca khác từ ngày Z: đóng dòng cũ ở Z, mở dòng mới từ Z (một transaction) */
export const MoveSlotAssignmentBody = z.strictObject({
  slotId: Id,
  from: IsoDate,
  note: AssignmentNote.optional(),
});
export type MoveSlotAssignmentBody = z.infer<typeof MoveSlotAssignmentBody>;

/**
 * Xoá hẳn một dòng lịch (từ 1.11.0 — thêm nhầm / không còn cần lịch sử). Buổi chưa xác nhận tự bỏ học sinh; buổi đã
 * xác nhận còn học sinh trả về để hỏi người dùng rồi gọi `slot-assignments/apply`.
 */
export const DeleteSlotAssignmentResponse = z.object({ affectedSessions: z.array(AffectedSessionRef) });
export type DeleteSlotAssignmentResponse = z.infer<typeof DeleteSlotAssignmentResponse>;

/** Học sinh của ca tại một ngày (mặc định hôm nay) */
export const SlotStudentsQuery = z.object({ date: IsoDate.optional() });
export type SlotStudentsQuery = z.infer<typeof SlotStudentsQuery>;

export const SlotStudent = z.object({
  studentId: Id,
  displayName: DisplayName,
  vietnameseName: VietnameseName,
  englishName: EnglishName.nullable(),
  avatarKey: AvatarKey,
  /** Lớp chính đang học */
  class: StudentClassRef.nullable(),
  assignmentId: Id,
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate.nullable(),
  /** Đơn giá áp dụng tại ngày xem — null khi không có quyền extra.viewPricing */
  rate: AppliedRate.nullable(),
});
export type SlotStudent = z.infer<typeof SlotStudent>;

export const SlotStudentsResponse = z.object({ date: IsoDate, items: z.array(SlotStudent) });
export type SlotStudentsResponse = z.infer<typeof SlotStudentsResponse>;

// ---------- Đơn giá ----------

/** Một dòng đơn giá. Phạm vi: (HS, ca) | (HS, null) = giá riêng HS | (null, ca) = giá mặc định của ca */
export const ExtraRate = z.object({
  id: Id,
  studentId: Id.nullable(),
  slotId: Id.nullable(),
  pricePerSession: PricePerSession,
  effectiveFrom: IsoDate,
  /** null = đang áp dụng; bằng `effectiveFrom` = bị dòng nhập sau thay thế từ đầu */
  effectiveTo: IsoDate.nullable(),
  note: z.string().nullable(),
  createdBy: z.object({ id: Id, displayName: DisplayName }).nullable(),
  createdAt: IsoDateTime,
  /**
   * Chỉ có ở response tạo / sửa giá (từ 1.9.0 / 1.11.0): bản ghi điểm danh đã xác nhận có đơn giá khác giá mới — hỏi rồi gọi
   * `extra-rates/:id/apply`. Buổi chưa xác nhận đã tự tính lại.
   */
  affectedRecords: z.array(AffectedRecordRef).optional(),
});
export type ExtraRate = z.infer<typeof ExtraRate>;

export const ExtraRatesResponse = z.object({ items: z.array(ExtraRate) });
export type ExtraRatesResponse = z.infer<typeof ExtraRatesResponse>;

/**
 * Đặt giá mới từ ngày `effectiveFrom` (có thể ở quá khứ để sửa sai). Dòng cùng phạm vi đang mở được đóng tại ngày đó;
 * dòng cùng phạm vi bắt đầu từ ngày đó trở đi bị thay thế.
 */
export const CreateSlotRateBody = z.strictObject({
  pricePerSession: PricePerSession,
  effectiveFrom: IsoDate,
  note: z.string().trim().max(200).optional(),
});
export type CreateSlotRateBody = z.infer<typeof CreateSlotRateBody>;

/**
 * Giá riêng học sinh (ưu đãi); `slotId` = chỉ ở một ca, không có = mọi ca học sinh học. `effectiveTo` (từ 1.16.0):
 * ngày đầu tiên hết ưu đãi (vd miễn phí tháng đầu) — từ ngày đó về giá chung của học sinh / giá ca.
 */
export const CreateStudentRateBody = CreateSlotRateBody.extend({
  slotId: Id.optional(),
  effectiveTo: IsoDate.optional(),
})
  .strict()
  .superRefine((b, ctx) => {
    if (b.effectiveTo !== undefined && b.effectiveTo <= b.effectiveFrom) {
      addValidationIssue(ctx, ['effectiveTo'], 'rateEndsAfterStart');
    }
  });
export type CreateStudentRateBody = z.infer<typeof CreateStudentRateBody>;

/**
 * Sửa đơn giá / ghi chú của một dòng giá đã có (từ 1.11.0 — nhập sai giá), giữ nguyên khoảng ngày. Response kèm
 * `affectedRecords` như khi đặt giá. Dòng bị thay thế từ đầu không sửa được.
 * `effectiveTo` (từ 1.16.0, chỉ giá riêng học sinh): kết thúc ưu đãi từ ngày đó (= ngày bắt đầu → bỏ hẳn), `null` = bỏ
 * hạn. Không được đè lên dòng cùng phạm vi bắt đầu sau.
 */
export const UpdateExtraRateBody = z
  .strictObject({
    pricePerSession: PricePerSession,
    note: z.string().trim().max(200).nullable(),
    effectiveTo: IsoDate.nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, ValidationMessage.atLeastOneField);
export type UpdateExtraRateBody = z.infer<typeof UpdateExtraRateBody>;

/** Tab "Học thêm" của học sinh */
export const StudentExtraResponse = z.object({
  /** Mọi dòng lịch (cả đã kết thúc), mới nhất trước */
  assignments: z.array(SlotAssignment),
  /** Giá riêng của học sinh (cả lịch sử) — null khi không có quyền extra.viewPricing */
  rates: z.array(ExtraRate).nullable(),
  /** Đơn giá áp dụng hôm nay ở từng ca đang học — null khi không có quyền */
  appliedRates: z.array(z.object({ slotId: Id, rate: AppliedRate })).nullable(),
  /** Người xem được sửa lịch (extra.manageSchedule + phạm vi) */
  canManageSchedule: z.boolean(),
  /** Người xem được đặt giá riêng học sinh (extra.managePricing + mọi ca đang học do mình dạy) */
  canManagePricing: z.boolean(),
});
export type StudentExtraResponse = z.infer<typeof StudentExtraResponse>;
