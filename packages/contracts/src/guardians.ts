import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { addValidationIssue, ValidationMessage } from './common/validation-messages.js';
import { AuthProvider, AvatarKey, DisplayName, Email, Phone, StudentClassRef, UserStatus } from './users.js';

/**
 * Phụ huynh (guardian) N–N với học sinh: anh chị em chung một phụ huynh, một học sinh có thể có nhiều phụ huynh
 * (đúng một người nhận học phí, người khác nhận bản sao). Phụ huynh có tài khoản gia đình = `account` khác null.
 */
export const GuardianRelation = z.enum(['MOTHER', 'FATHER', 'GRANDPARENT', 'OTHER']);
export type GuardianRelation = z.infer<typeof GuardianRelation>;

export const GuardianName = z.string().trim().min(1).max(60);
export const GuardianNote = z.string().trim().max(500);

/** Tài khoản gia đình của phụ huynh (role PARENT) */
export const GuardianAccount = z.object({
  userId: Id,
  status: UserStatus,
  provider: AuthProvider,
  /** false = đã gửi mời nhưng phụ huynh chưa đặt mật khẩu (và chưa liên kết Google) */
  hasCredentials: z.boolean(),
  lastLoginAt: IsoDateTime.nullable(),
});
export type GuardianAccount = z.infer<typeof GuardianAccount>;

export const Guardian = z.object({
  id: Id,
  fullName: GuardianName,
  email: Email.nullable(),
  /** E.164, vd `+84912345678` */
  phone: z.string().nullable(),
  note: z.string().nullable(),
  account: GuardianAccount.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Guardian = z.infer<typeof Guardian>;

/** Cờ của liên kết phụ huynh ↔ học sinh */
export const GuardianLinkFlags = z.object({
  relation: GuardianRelation,
  /** Nhận mail học phí (đúng một phụ huynh / học sinh) */
  isBillingContact: z.boolean(),
  /** Nhận bản sao (cc) mail tháng */
  receivesReports: z.boolean(),
  /** Được vào hồ sơ bé bằng tài khoản gia đình */
  canAccess: z.boolean(),
});
export type GuardianLinkFlags = z.infer<typeof GuardianLinkFlags>;

/** Một bé trong danh sách con của phụ huynh */
export const GuardianChild = GuardianLinkFlags.extend({
  studentId: Id,
  displayName: DisplayName,
  vietnameseName: DisplayName,
  englishName: DisplayName.nullable(),
  avatarKey: AvatarKey,
  status: UserStatus,
  class: StudentClassRef.nullable(),
});
export type GuardianChild = z.infer<typeof GuardianChild>;

export const GuardianSummary = Guardian.extend({ children: z.array(GuardianChild) });
export type GuardianSummary = z.infer<typeof GuardianSummary>;

export const GuardianListQuery = PageQuery.extend({
  /** true = chỉ phụ huynh đã có tài khoản gia đình; false = chưa có */
  hasAccount: z.enum(['true', 'false']).optional(),
});
export type GuardianListQuery = z.infer<typeof GuardianListQuery>;

export const CreateGuardianBody = z.strictObject({
  fullName: GuardianName,
  email: Email.optional(),
  phone: Phone.optional(),
  note: GuardianNote.optional(),
});
export type CreateGuardianBody = z.infer<typeof CreateGuardianBody>;

/** `null` = xoá giá trị */
export const UpdateGuardianBody = z
  .strictObject({
    fullName: GuardianName,
    email: Email.nullable(),
    phone: Phone.nullable(),
    note: GuardianNote.nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, ValidationMessage.atLeastOneField);
export type UpdateGuardianBody = z.infer<typeof UpdateGuardianBody>;

/** Phụ huynh của một học sinh (trang chi tiết học sinh) */
export const StudentGuardianView = GuardianLinkFlags.extend({ guardian: Guardian });
export type StudentGuardianView = z.infer<typeof StudentGuardianView>;

export const StudentGuardiansResponse = z.object({ items: z.array(StudentGuardianView) });
export type StudentGuardiansResponse = z.infer<typeof StudentGuardiansResponse>;

export const StudentGuardianLink = GuardianLinkFlags.extend({ guardianId: Id }).strict();
export type StudentGuardianLink = z.infer<typeof StudentGuardianLink>;

/** Thay toàn bộ phụ huynh của học sinh. Có phụ huynh thì phải đúng một người nhận học phí. */
export const SetStudentGuardiansBody = z
  .strictObject({ guardians: z.array(StudentGuardianLink).max(4) })
  .superRefine((b, ctx) => {
    if (new Set(b.guardians.map((g) => g.guardianId)).size !== b.guardians.length) {
      addValidationIssue(ctx, ['guardians'], 'duplicateGuardian');
    }
    if (b.guardians.length && b.guardians.filter((g) => g.isBillingContact).length !== 1) {
      addValidationIssue(ctx, ['guardians'], 'oneBillingContact');
    }
  });
export type SetStudentGuardiansBody = z.infer<typeof SetStudentGuardiansBody>;

/** Tạo tài khoản gia đình cho phụ huynh có sẵn → mail mời đặt mật khẩu */
export const FamilyAccountResponse = z.object({ guardian: GuardianSummary, inviteSent: z.boolean() });
export type FamilyAccountResponse = z.infer<typeof FamilyAccountResponse>;
