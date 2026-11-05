/** Luật thuần của tài khoản gia đình: gom đơn chờ duyệt */
import { type UserStatus } from '@phonics/contracts';
import { type PendingChildRow } from '@/modules/families/types/family.types';

/** Gia đình của một bé chờ duyệt = tài khoản PARENT đã đăng ký */
export interface PendingGroup {
  /** Id tài khoản phụ huynh */
  id: string;
  parent: {
    userId: string;
    guardianId: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    status: UserStatus;
    createdAt: Date;
  };
  children: PendingChildRow[];
}

/** Phụ huynh có tài khoản gia đình của bé (nếu có) */
export function familyParentOf(row: PendingChildRow) {
  const link = row.guardians.find((g) => g.guardian.user?.role === 'PARENT');
  return link?.guardian ?? null;
}

/**
 * Gom bé chờ duyệt theo tài khoản phụ huynh, giữ thứ tự xuất hiện. Bé chờ duyệt không có tài khoản gia đình (đơn
 * học sinh tự đăng ký kiểu cũ — migration `family_first` đã chuyển sang REJECTED) bị bỏ qua.
 */
export function groupPendingChildren(rows: readonly PendingChildRow[]): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const row of rows) {
    const guardian = familyParentOf(row);
    if (!guardian?.user) continue;
    const id = guardian.user.id;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        parent: {
          userId: guardian.user.id,
          guardianId: guardian.id,
          fullName: guardian.fullName,
          email: guardian.email,
          phone: guardian.phone,
          status: guardian.user.status,
          createdAt: guardian.user.createdAt,
        },
        children: [],
      };
      groups.set(id, group);
    }
    group.children.push(row);
  }
  return [...groups.values()];
}

/** Bé thuộc đơn `accountId` (tài khoản phụ huynh) */
export function belongsToFamily(row: PendingChildRow, accountId: string): boolean {
  return familyParentOf(row)?.user?.id === accountId;
}
