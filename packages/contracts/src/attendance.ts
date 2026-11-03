import { z } from 'zod';
import { TeacherRef } from './classes.js';
import { IsoDate, IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { addValidationIssue, ValidationMessage } from './common/validation-messages.js';
import {
  AffectedRecordRef,
  AffectedSessionRef,
  ExtraSlotKind,
  ExtraSlotRef,
  PricePerSession,
  TimeOfDay,
} from './extra-lessons.js';
import { EnglishName, VietnameseName } from './students.js';
import { AvatarKey, DisplayName } from './users.js';

/**
 * Điểm danh học thêm (docs/attendance-design.md §5): 00:05 tạo buổi của ngày từ lịch học sinh (mặc định có mặt, chốt
 * đơn giá), GV điểm danh trong app, 21:00 mỗi GV nhận một mail các buổi chưa xác nhận (duyệt nhanh bằng link token).
 */
export const AttendanceSessionStatus = z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']);
export type AttendanceSessionStatus = z.infer<typeof AttendanceSessionStatus>;

/** ABSENT = vắng không phép, EXCUSED = vắng có phép */
export const AttendanceMark = z.enum(['PRESENT', 'ABSENT', 'EXCUSED']);
export type AttendanceMark = z.infer<typeof AttendanceMark>;

/** SNAPSHOT = từ lịch học sinh; MANUAL = GV thêm (học bù / học thử) */
export const AttendanceRecordSource = z.enum(['SNAPSHOT', 'MANUAL']);
export type AttendanceRecordSource = z.infer<typeof AttendanceRecordSource>;

/** Có tính tiền buổi theo điểm danh không (mặc định; admin ghi đè từng bản ghi) — vắng không tính tiền */
export const BILLING_POLICY: Record<AttendanceMark, boolean> = {
  PRESENT: true,
  ABSENT: false,
  EXCUSED: false,
};

export const ConfirmedVia = z.enum(['APP', 'EMAIL']);
export type ConfirmedVia = z.infer<typeof ConfirmedVia>;

export const AttendanceRecord = z.object({
  studentId: Id,
  displayName: DisplayName,
  vietnameseName: VietnameseName,
  englishName: EnglishName.nullable(),
  avatarKey: AvatarKey,
  mark: AttendanceMark,
  charged: z.boolean(),
  /** Đơn giá chốt — null khi người xem không có quyền extra.viewPricing */
  unitPrice: PricePerSession.nullable(),
  /** Không tìm được đơn giá lúc chốt (0đ) — cảnh báo */
  missingRate: z.boolean(),
  source: AttendanceRecordSource,
  note: z.string().nullable(),
  updatedAt: IsoDateTime,
});
export type AttendanceRecord = z.infer<typeof AttendanceRecord>;

export const AttendanceSessionSummary = z.object({
  id: Id,
  /** null = buổi bù tạo tay */
  slot: ExtraSlotRef.nullable(),
  /** Chép từ ca lúc tạo; buổi bù chọn tay (từ 1.17.0) */
  kind: ExtraSlotKind,
  date: IsoDate,
  startTime: TimeOfDay,
  endTime: TimeOfDay,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  teachers: z.array(TeacherRef),
  status: AttendanceSessionStatus,
  studentCount: z.int().min(0),
  presentCount: z.int().min(0),
  /** Tăng mỗi lần sửa danh sách — duyệt qua mail chỉ hợp lệ khi chưa đổi */
  recordsVersion: z.int().min(0),
  missingRateCount: z.int().min(0),
  confirmedBy: z.object({ id: Id, displayName: DisplayName }).nullable(),
  confirmedAt: IsoDateTime.nullable(),
  confirmedVia: ConfirmedVia.nullable(),
  cancelReason: z.string().nullable(),
  note: z.string().nullable(),
});
export type AttendanceSessionSummary = z.infer<typeof AttendanceSessionSummary>;

export const AttendanceSessionDetail = AttendanceSessionSummary.extend({
  records: z.array(AttendanceRecord),
  /** Người xem được điểm danh / xác nhận (attendance.confirm + dạy buổi) */
  canEdit: z.boolean(),
  /** Admin: ghi đè `charged` / `unitPrice` từng bản ghi */
  canEditBilling: z.boolean(),
});
export type AttendanceSessionDetail = z.infer<typeof AttendanceSessionDetail>;

export const ATTENDANCE_SORT_FIELDS = ['date', 'startsAt', 'status'] as const;

export const AttendanceSessionListQuery = PageQuery.extend({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  slotId: Id.optional(),
  teacherId: Id.optional(),
  status: AttendanceSessionStatus.optional(),
});
export type AttendanceSessionListQuery = z.infer<typeof AttendanceSessionListQuery>;

/** Sửa điểm danh: học sinh chưa có trong buổi → thêm MANUAL (học bù / học thử). `charged` / `unitPrice` chỉ admin. */
export const AttendanceRecordChange = z.strictObject({
  studentId: Id,
  mark: AttendanceMark.optional(),
  note: z.string().trim().max(200).nullable().optional(),
  charged: z.boolean().optional(),
  unitPrice: PricePerSession.optional(),
});
export type AttendanceRecordChange = z.infer<typeof AttendanceRecordChange>;

export const UpdateAttendanceRecordsBody = z
  .strictObject({
    records: z.array(AttendanceRecordChange).max(100).optional(),
    /** Bỏ học sinh MANUAL khỏi buổi (học sinh theo lịch thì đánh vắng hoặc sửa lịch) */
    remove: z.array(Id).max(100).optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((b) => (b.records?.length ?? 0) + (b.remove?.length ?? 0) > 0 || b.note !== undefined, {
    message: ValidationMessage.atLeastOneChange,
  })
  .superRefine((b, ctx) => {
    const ids = b.records?.map((r) => r.studentId) ?? [];
    if (new Set(ids).size !== ids.length) addValidationIssue(ctx, ['records'], 'duplicateStudent');
  });
export type UpdateAttendanceRecordsBody = z.infer<typeof UpdateAttendanceRecordsBody>;

/** Buổi bù (không theo ca): admin tạo tay rồi thêm học sinh MANUAL */
export const CreateAttendanceSessionBody = z
  .strictObject({
    date: IsoDate,
    startTime: TimeOfDay,
    endTime: TimeOfDay,
    teacherIds: z.array(Id).min(1).max(5),
    /** Mặc định học thêm */
    kind: ExtraSlotKind.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.endTime <= b.startTime) addValidationIssue(ctx, ['endTime'], 'endAfterStart');
  });
export type CreateAttendanceSessionBody = z.infer<typeof CreateAttendanceSessionBody>;

/** Huỷ hàng loạt (nghỉ lễ): theo danh sách buổi hoặc cả một ngày (buổi chưa tạo thì tạo luôn ở trạng thái huỷ) */
/** Số ngày trong [from, to] (cả hai đầu), ngày `YYYY-MM-DD` */
export function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export const CancelAttendanceSessionsBody = z
  .strictObject({
    sessionIds: z.array(Id).min(1).max(100).optional(),
    /** Huỷ cả ngày `date` (buổi chưa tạo cũng được tạo sẵn ở trạng thái huỷ) — nghỉ lễ */
    date: IsoDate.optional(),
    /** Nghỉ nhiều ngày: từ `date` đến `dateTo` (gồm cả hai đầu, tối đa 62 ngày) */
    dateTo: IsoDate.optional(),
    /** Chỉ huỷ các ca này (bỏ trống = mọi ca); dùng cùng `date` */
    slotIds: z.array(Id).min(1).max(50).optional(),
    reason: z.string().trim().min(1).max(200),
  })
  .refine((b) => !!b.sessionIds !== !!b.date, {
    message: ValidationMessage.sessionsOrDate,
    path: ['sessionIds'],
  })
  .superRefine((b, ctx) => {
    if ((b.dateTo || b.slotIds) && !b.date) addValidationIssue(ctx, ['slotIds'], 'slotsNeedDate');
    if (b.date && b.dateTo && (b.dateTo < b.date || dayCount(b.date, b.dateTo) > 62))
      addValidationIssue(ctx, ['dateTo'], 'cancelRange');
  });
export type CancelAttendanceSessionsBody = z.infer<typeof CancelAttendanceSessionsBody>;

export const CancelAttendanceSessionsResponse = z.object({ cancelled: z.array(Id) });
export type CancelAttendanceSessionsResponse = z.infer<typeof CancelAttendanceSessionsResponse>;

// ---------- Mail 21:00 → trang duyệt nhanh (public, theo token) ----------

export const DigestSession = z.object({
  id: Id,
  slotName: z.string().nullable(),
  date: IsoDate,
  startTime: TimeOfDay,
  endTime: TimeOfDay,
  studentCount: z.int().min(0),
  presentCount: z.int().min(0),
  status: AttendanceSessionStatus,
  /** Danh sách đã đổi sau khi gửi mail → phải đăng nhập để xem / xác nhận */
  changed: z.boolean(),
  confirmedByName: z.string().nullable(),
  confirmedAt: IsoDateTime.nullable(),
});
export type DigestSession = z.infer<typeof DigestSession>;

export const AttendanceDigestView = z.object({
  teacherName: DisplayName,
  date: IsoDate,
  expiresAt: IsoDateTime,
  sessions: z.array(DigestSession),
});
export type AttendanceDigestView = z.infer<typeof AttendanceDigestView>;

export const ConfirmDigestBody = z.strictObject({ sessionIds: z.array(Id).min(1).max(50) });
export type ConfirmDigestBody = z.infer<typeof ConfirmDigestBody>;

export const ConfirmDigestResponse = z.object({
  confirmed: z.array(Id),
  /** Đã được xác nhận trước đó (bởi mình / GV khác / trong app) */
  alreadyConfirmed: z.array(Id),
  /** Danh sách đổi sau khi gửi mail, đã huỷ, hoặc không thuộc mail này */
  rejected: z.array(Id),
  digest: AttendanceDigestView,
});
export type ConfirmDigestResponse = z.infer<typeof ConfirmDigestResponse>;

/** ADMIN gửi lại mail xác nhận: mỗi GV của các buổi (còn PENDING) một mail mới, link cũ vẫn dùng được */
export const ResendDigestBody = z.strictObject({ sessionIds: z.array(Id).min(1).max(200) });
export type ResendDigestBody = z.infer<typeof ResendDigestBody>;

export const DigestTeacherRef = z.object({ teacherId: Id, teacherName: DisplayName });

export const ResendDigestResponse = z.object({
  /** GV đã xếp hàng mail kèm số buổi trong mail */
  sent: z.array(DigestTeacherRef.extend({ sessionCount: z.int() })),
  /** GV không có email */
  noEmail: z.array(DigestTeacherRef),
  /** Buổi bỏ qua: không còn PENDING / không có GV phụ trách */
  skipped: z.array(Id),
});
export type ResendDigestResponse = z.infer<typeof ResendDigestResponse>;

// ---------- Thống kê học phí (tạm tính từ điểm danh, chưa phải phiếu học phí §7) ----------

export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, ValidationMessage.monthFormat);

/** Số tháng trong [from, to] (cả hai đầu) */
export function monthSpan(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Khoảng tháng [from, to], tối đa 24 tháng */
export const TuitionQuery = z.object({ from: YearMonth, to: YearMonth }).superRefine((q, ctx) => {
  const span = monthSpan(q.from, q.to);
  if (span < 1 || span > 24) addValidationIssue(ctx, ['to'], 'monthRange');
});
export type TuitionQuery = z.infer<typeof TuitionQuery>;

/**
 * Tiền học một tháng (VND), không tính buổi đã huỷ. `confirmedTotal` = Σ đơn giá bản ghi tính phí của buổi đã xác
 * nhận; `pendingTotal` = như vậy với buổi chưa xác nhận (còn có thể đổi).
 */
export const TuitionMonth = z.object({
  month: YearMonth,
  confirmedTotal: z.int(),
  pendingTotal: z.int(),
  /** Số lượt học sinh-buổi tính phí */
  chargedCount: z.int(),
  presentCount: z.int(),
  absentCount: z.int(),
  excusedCount: z.int(),
  /** Số học sinh có điểm danh trong tháng (học sinh: 0 / 1) */
  studentCount: z.int(),
});
export type TuitionMonth = z.infer<typeof TuitionMonth>;

const TuitionTotals = TuitionMonth.omit({ month: true });

export const TuitionBySlot = TuitionTotals.extend({
  /** null = buổi bù không theo ca */
  slotId: Id.nullable(),
  slotName: z.string().nullable(),
});
export type TuitionBySlot = z.infer<typeof TuitionBySlot>;

export const TuitionByStudent = TuitionTotals.omit({ studentCount: true }).extend({
  studentId: Id,
  displayName: DisplayName,
});
export type TuitionByStudent = z.infer<typeof TuitionByStudent>;

export const TuitionOverview = z.object({
  from: YearMonth,
  to: YearMonth,
  /** Đủ mọi tháng trong khoảng (tháng không có buổi = 0) */
  months: z.array(TuitionMonth),
  totals: TuitionTotals,
  bySlot: z.array(TuitionBySlot),
  /** Học sinh nhiều tiền học nhất (tối đa 10) */
  topStudents: z.array(TuitionByStudent),
  /** Buổi còn chờ xác nhận trong khoảng */
  pendingSessions: z.int(),
  /** Bản ghi tính phí chưa có đơn giá (0đ, không có dòng giá). Giá 0đ đã đặt = miễn phí, không tính vào đây */
  zeroPriceRecords: z.int(),
});
export type TuitionOverview = z.infer<typeof TuitionOverview>;

export const StudentTuitionResponse = z.object({
  from: YearMonth,
  to: YearMonth,
  months: z.array(TuitionMonth),
  totals: TuitionTotals,
});
export type StudentTuitionResponse = z.infer<typeof StudentTuitionResponse>;

// ---------- Ảnh hưởng của việc sửa lịch / đơn giá lên buổi đã có ----------

/** Buổi đã xác nhận bị ảnh hưởng khi sửa lịch học sinh (ADD: nên có trong buổi; REMOVE: không còn theo lịch) */
export const AffectedSession = AffectedSessionRef;
export type AffectedSession = z.infer<typeof AffectedSession>;

/** Bản ghi đã xác nhận có đơn giá khác giá mới (buổi chưa xác nhận tự tính lại) */
export const AffectedRecord = AffectedRecordRef;
export type AffectedRecord = z.infer<typeof AffectedRecord>;

/** Áp thay đổi lịch / giá vào các buổi đã xác nhận được liệt kê */
export const ApplyToSessionsBody = z.strictObject({ sessionIds: z.array(Id).min(1).max(200) });
export type ApplyToSessionsBody = z.infer<typeof ApplyToSessionsBody>;

export const ApplyToSessionsResponse = z.object({ updated: z.array(Id) });
export type ApplyToSessionsResponse = z.infer<typeof ApplyToSessionsResponse>;

// ---------- Điểm danh theo tháng của học sinh ----------

export const StudentAttendanceQuery = z.object({ month: YearMonth });
export type StudentAttendanceQuery = z.infer<typeof StudentAttendanceQuery>;

export const StudentAttendanceItem = z.object({
  sessionId: Id,
  date: IsoDate,
  startTime: TimeOfDay,
  slotName: z.string().nullable(),
  status: AttendanceSessionStatus,
  mark: AttendanceMark,
  charged: z.boolean(),
  unitPrice: PricePerSession.nullable(),
  source: AttendanceRecordSource,
});
export type StudentAttendanceItem = z.infer<typeof StudentAttendanceItem>;

export const StudentAttendanceResponse = z.object({
  month: z.string(),
  items: z.array(StudentAttendanceItem),
  /** Tổng tiền các buổi tính phí (không gồm buổi huỷ) — null khi không có quyền xem giá */
  chargedTotal: z.int().nullable(),
});
export type StudentAttendanceResponse = z.infer<typeof StudentAttendanceResponse>;
