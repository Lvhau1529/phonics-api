/** Luật thuần của tài khoản gia đình: gom đơn chờ duyệt, chọn chế độ chuyển đổi */
import { type ConvertBlocker, type ConvertPreview, type UserStatus } from '@phonics/contracts';
import { type PendingChildRow } from '@/modules/families/types/family.types';

/** Gia đình của một bé chờ duyệt: tài khoản PARENT (đăng ký mới) hoặc chính bé (đăng ký kiểu cũ, không có phụ huynh) */
export interface PendingGroup {
  /** Id tài khoản đăng ký */
  id: string;
  parent: {
    userId: string;
    guardianId: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    status: UserStatus;
    createdAt: Date;
  } | null;
  children: PendingChildRow[];
}

/** Phụ huynh có tài khoản gia đình của bé (nếu có) */
export function familyParentOf(row: PendingChildRow) {
  const link = row.guardians.find((g) => g.guardian.user?.role === 'PARENT');
  return link?.guardian ?? null;
}

/** Gom bé chờ duyệt theo tài khoản đăng ký, giữ thứ tự xuất hiện */
export function groupPendingChildren(rows: readonly PendingChildRow[]): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const row of rows) {
    const guardian = familyParentOf(row);
    const id = guardian?.user?.id ?? row.userId;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        parent:
          guardian?.user != null
            ? {
                userId: guardian.user.id,
                guardianId: guardian.id,
                fullName: guardian.fullName,
                email: guardian.email,
                phone: guardian.phone,
                status: guardian.user.status,
                createdAt: guardian.user.createdAt,
              }
            : null,
        children: [],
      };
      groups.set(id, group);
    }
    group.children.push(row);
  }
  return [...groups.values()];
}

/** Bé thuộc đơn `accountId`: chính bé (đơn kiểu cũ) hoặc bé của phụ huynh có tài khoản đó */
export function belongsToFamily(row: PendingChildRow, accountId: string): boolean {
  return row.userId === accountId || familyParentOf(row)?.user?.id === accountId;
}

/** Dữ liệu cần để quyết định cách chuyển sang tài khoản gia đình */
export interface ConvertInput {
  guardian: { email: string | null; userId: string | null };
  requestedIds: readonly string[];
  students: readonly { id: string; email: string | null }[];
  /** Tài khoản đang dùng email phụ huynh (nếu có) */
  emailOwner: { id: string } | null;
}

/**
 * existing: phụ huynh đã có tài khoản; move: email đăng nhập của một học sinh được chọn là email phụ huynh → chuyển
 * thông tin đăng nhập sang tài khoản gia đình; create: tạo tài khoản mới + mail mời đặt mật khẩu.
 */
export function convertPlan(input: ConvertInput): {
  account: ConvertPreview['account'];
  credentialsFrom: string | null;
  blockers: ConvertBlocker[];
} {
  const blockers: ConvertBlocker[] = [];
  if (input.students.length !== input.requestedIds.length) blockers.push('STUDENT_NOT_FOUND');
  if (input.guardian.userId) return { account: 'existing', credentialsFrom: null, blockers };

  const email = input.guardian.email;
  if (!email)
    return { account: 'create', credentialsFrom: null, blockers: [...blockers, 'GUARDIAN_NO_EMAIL'] };
  const source = input.students.find((s) => s.email === email);
  if (source) return { account: 'move', credentialsFrom: source.id, blockers };
  if (input.emailOwner) blockers.push('EMAIL_USED_BY_OTHER_ACCOUNT');
  return { account: 'create', credentialsFrom: null, blockers };
}
