/** Tên học sinh: tiếng Việt (bắt buộc) + tiếng Anh (tuỳ chọn), tên hiển thị suy ra, cột tìm / sắp xếp — hàm thuần */

export interface StudentNames {
  vietnameseName: string;
  englishName: string | null;
}

/** Các cột ghi xuống DB khi đổi tên (profile + `users.display_name`) */
export interface StudentNameColumns extends StudentNames {
  displayName: string;
  nameSearch: string;
  nameSortKey: string;
}

/** Body có thể đổi tên: trường mới + `displayName` của client cũ */
export interface NameChange {
  vietnameseName?: string;
  englishName?: string | null;
  displayName?: string;
}

/**
 * Chữ thường, bỏ dấu (`đ` → `d`), gộp khoảng trắng — để tìm "nguyen an" ra "Nguyễn Văn An". Migration
 * `student_names` dùng cùng quy tắc (bằng SQL) để điền dữ liệu cũ.
 */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tên hiển thị trong game / xếp hạng: tên tiếng Anh nếu có */
export function displayNameOf(names: StudentNames): string {
  return names.englishName ?? names.vietnameseName;
}

/** Đủ các cột cần ghi cho bộ tên `names` (đã trim; tên tiếng Anh rỗng → null) */
export function nameColumns(names: StudentNames): StudentNameColumns {
  const vietnameseName = names.vietnameseName.trim().replace(/\s+/g, ' ');
  const englishName = names.englishName?.trim().replace(/\s+/g, ' ') || null;
  // Người Việt gọi theo tên (từ cuối): "Nguyễn Văn An" xếp theo "an", trùng tên thì theo cả họ tên
  const given = vietnameseName.split(' ').at(-1) ?? vietnameseName;
  return {
    vietnameseName,
    englishName,
    displayName: displayNameOf({ vietnameseName, englishName }),
    nameSearch: foldName([vietnameseName, englishName].filter(Boolean).join(' ')),
    nameSortKey: foldName(`${given} ${vietnameseName}`),
  };
}

/** Cột tên của `student_profiles` (không gồm `users.display_name`) */
export function profileNameData(columns: StudentNameColumns): Omit<StudentNameColumns, 'displayName'> {
  const { displayName: _displayName, ...profile } = columns;
  return profile;
}

/**
 * Bộ tên sau khi áp `change`; null = không đổi gì. `vietnameseName` / `englishName` thắng; chỉ có `displayName`
 * (client cũ) thì sửa tên **đang hiển thị**: tên tiếng Anh nếu đang có, không thì tên tiếng Việt — đúng như trước
 * đây (`displayName` sau khi sửa = giá trị gửi lên).
 */
export function applyNameChange(current: StudentNames, change: NameChange): StudentNames | null {
  let next: StudentNames;
  if (change.vietnameseName !== undefined || change.englishName !== undefined) {
    next = {
      vietnameseName: change.vietnameseName ?? current.vietnameseName,
      englishName: change.englishName !== undefined ? change.englishName : current.englishName,
    };
  } else if (change.displayName !== undefined) {
    next = current.englishName
      ? { ...current, englishName: change.displayName }
      : { ...current, vietnameseName: change.displayName };
  } else {
    return null;
  }
  const a = nameColumns(current);
  const b = nameColumns(next);
  return a.vietnameseName === b.vietnameseName && a.englishName === b.englishName
    ? null
    : { vietnameseName: b.vietnameseName, englishName: b.englishName };
}
