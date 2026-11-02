import { z } from 'zod';
import { PublicClass } from './classes.js';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { addValidationIssue, ValidationMessage } from './common/validation-messages.js';
import { GuardianName } from './guardians.js';
import { EnglishName, VietnameseName } from './students.js';
import { AvatarKey, DisplayName, Email, Password, Phone, StudentClassRef, UserStatus } from './users.js';

/**
 * Tài khoản gia đình: phụ huynh giữ một đăng nhập (role PARENT), mỗi bé là một hồ sơ học sinh (`loginMode` MANAGED).
 * Đăng nhập → `auth/profiles` → chọn bé → `auth/switch-profile` → token học sinh (chơi như học sinh bình thường).
 * Tài khoản tự đăng ký ở trạng thái PENDING tới khi GV / admin duyệt từng bé.
 */

/** Đăng nhập của phụ huynh: email + mật khẩu hoặc Google (ID token) */
export const FamilyCredentials = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('password'), email: Email, password: Password }),
  z.strictObject({ type: z.literal('google'), idToken: z.string().min(1).max(4096) }),
]);
export type FamilyCredentials = z.infer<typeof FamilyCredentials>;

/** Một bé khi đăng ký / thêm bé: lớp muốn vào lấy từ GET /public/classes */
export const ChildInput = z.strictObject({
  vietnameseName: VietnameseName,
  englishName: EnglishName.nullable().optional(),
  avatarKey: AvatarKey.optional(),
  classId: Id,
});
export type ChildInput = z.infer<typeof ChildInput>;

export const FAMILY_MAX_CHILDREN = 6;

export const RegisterFamilyBody = z
  .strictObject({
    credentials: FamilyCredentials,
    parent: z.strictObject({ fullName: GuardianName, phone: Phone }),
    children: z.array(ChildInput).min(1).max(FAMILY_MAX_CHILDREN),
  })
  .superRefine((b, ctx) => {
    const names = b.children.map((c) => c.vietnameseName.toLowerCase());
    if (new Set(names).size !== names.length) addValidationIssue(ctx, ['children'], 'duplicateChild');
  });
export type RegisterFamilyBody = z.infer<typeof RegisterFamilyBody>;

/** Hồ sơ một bé trong tài khoản gia đình (màn chọn bé / khu phụ huynh) */
export const FamilyProfile = z.object({
  id: Id,
  displayName: DisplayName,
  vietnameseName: VietnameseName,
  englishName: EnglishName.nullable(),
  avatarKey: AvatarKey,
  /** Chỉ ACTIVE mới vào chơi được */
  status: UserStatus,
  class: StudentClassRef.nullable(),
  /** Lớp đã đăng ký, chờ duyệt */
  requestedClass: PublicClass.nullable(),
  /** Lý do từ chối (status REJECTED) */
  rejectReason: z.string().nullable(),
});
export type FamilyProfile = z.infer<typeof FamilyProfile>;

export const FamilyProfilesResponse = z.object({ items: z.array(FamilyProfile) });
export type FamilyProfilesResponse = z.infer<typeof FamilyProfilesResponse>;

export const SwitchProfileBody = z.strictObject({ studentId: Id });
export type SwitchProfileBody = z.infer<typeof SwitchProfileBody>;

/** Đặt mật khẩu lần đầu từ link mời (token một lần, có hạn) → đăng nhập luôn */
export const SetPasswordBody = z.strictObject({
  token: z.string().min(20).max(200),
  password: Password,
});
export type SetPasswordBody = z.infer<typeof SetPasswordBody>;

/** Phụ huynh sửa bé đang chờ duyệt (bé đã duyệt thì nhờ GV sửa) */
export const UpdateChildBody = z
  .strictObject({
    vietnameseName: VietnameseName,
    englishName: EnglishName.nullable(),
    avatarKey: AvatarKey,
    classId: Id,
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, ValidationMessage.atLeastOneField);
export type UpdateChildBody = z.infer<typeof UpdateChildBody>;

/** Phụ huynh tự xem / sửa thông tin liên hệ của mình */
export const MyGuardian = z.object({
  id: Id,
  fullName: GuardianName,
  email: Email.nullable(),
  phone: z.string().nullable(),
});
export type MyGuardian = z.infer<typeof MyGuardian>;

export const UpdateMyGuardianBody = z
  .strictObject({ fullName: GuardianName, phone: Phone })
  .partial()
  .refine((b) => Object.keys(b).length > 0, ValidationMessage.atLeastOneField);
export type UpdateMyGuardianBody = z.infer<typeof UpdateMyGuardianBody>;

// ---------- Duyệt tài khoản ----------

/** Bé đang chờ duyệt */
export const PendingChild = z.object({
  studentId: Id,
  displayName: DisplayName,
  vietnameseName: VietnameseName,
  englishName: EnglishName.nullable(),
  avatarKey: AvatarKey,
  requestedClass: PublicClass.nullable(),
  createdAt: IsoDateTime,
});
export type PendingChild = z.infer<typeof PendingChild>;

/**
 * Cảnh báo trùng: email / SĐT phụ huynh trùng phụ huynh khác, hoặc bé trùng họ tên với học sinh đã có.
 * `inScope = false` (GV, gia đình kia không có con trong lớp mình): không kèm tên / id, chỉ báo "trùng với một gia
 * đình khác — báo admin".
 */
export const DuplicateMatch = z.object({
  kind: z.enum(['GUARDIAN_EMAIL', 'GUARDIAN_PHONE', 'STUDENT_NAME']),
  /** Bé đang chờ bị trùng (STUDENT_NAME) */
  childId: Id.nullable(),
  inScope: z.boolean(),
  guardianId: Id.nullable(),
  guardianName: z.string().nullable(),
  studentId: Id.nullable(),
  studentName: z.string().nullable(),
  className: z.string().nullable(),
});
export type DuplicateMatch = z.infer<typeof DuplicateMatch>;

/** Một đơn chờ duyệt = một tài khoản (phụ huynh, hoặc học sinh tự đăng ký kiểu cũ — `parent` null) */
export const PendingFamily = z.object({
  /** Id tài khoản đăng ký (user PARENT, hoặc chính học sinh với đăng ký kiểu cũ) — dùng ở approve / reject / merge */
  id: Id,
  parent: z
    .object({
      userId: Id,
      guardianId: Id,
      fullName: GuardianName,
      email: Email.nullable(),
      phone: z.string().nullable(),
      status: UserStatus,
    })
    .nullable(),
  /** Bé chờ duyệt trong phạm vi người xem */
  children: z.array(PendingChild),
  /** Số bé khác của gia đình (đã duyệt, hoặc chờ duyệt vào lớp ngoài phạm vi) */
  otherChildren: z.int().min(0),
  duplicates: z.array(DuplicateMatch),
  createdAt: IsoDateTime,
});
export type PendingFamily = z.infer<typeof PendingFamily>;

export const PendingFamiliesResponse = z.object({ items: z.array(PendingFamily) });
export type PendingFamiliesResponse = z.infer<typeof PendingFamiliesResponse>;

export const PendingCountResponse = z.object({ count: z.int().min(0) });
export type PendingCountResponse = z.infer<typeof PendingCountResponse>;

/** Duyệt từng bé + chọn lớp (GV: chỉ lớp mình dạy). Bé không có trong danh sách vẫn chờ. */
export const ApproveFamilyBody = z
  .strictObject({
    children: z
      .array(z.strictObject({ studentId: Id, classId: Id }))
      .min(1)
      .max(FAMILY_MAX_CHILDREN * 2),
  })
  .refine((b) => new Set(b.children.map((c) => c.studentId)).size === b.children.length, {
    message: ValidationMessage.duplicateStudent,
    path: ['children'],
  });
export type ApproveFamilyBody = z.infer<typeof ApproveFamilyBody>;

/** Từ chối bé (kèm lý do). Không truyền `studentIds` = từ chối mọi bé đang chờ trong phạm vi người duyệt. */
export const RejectFamilyBody = z.strictObject({
  studentIds: z
    .array(Id)
    .min(1)
    .max(FAMILY_MAX_CHILDREN * 2)
    .optional(),
  reason: z.string().trim().min(1).max(300),
});
export type RejectFamilyBody = z.infer<typeof RejectFamilyBody>;

/** Gộp đơn vào phụ huynh có sẵn (đăng ký trùng): các bé chuyển sang phụ huynh đó, vẫn chờ duyệt */
export const MergeFamilyBody = z.strictObject({ guardianId: Id });
export type MergeFamilyBody = z.infer<typeof MergeFamilyBody>;

export const FamilyReviewResult = z.object({
  approved: z.array(Id),
  rejected: z.array(Id),
  /** Trạng thái tài khoản phụ huynh sau thao tác (null với đơn kiểu cũ không có phụ huynh) */
  parentStatus: UserStatus.nullable(),
});
export type FamilyReviewResult = z.infer<typeof FamilyReviewResult>;
