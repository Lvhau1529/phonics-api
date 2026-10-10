import { type PrismaClient } from '../../generated/prisma/client';

/** Nhóm quyền mẫu (hệ thống): admin có thể sửa quyền, không xoá được */
export async function seedPermissionGroups(prisma: PrismaClient): Promise<void> {
  const groups = [
    {
      name: 'Giáo viên chủ nhiệm',
      description: 'Được chuyển lớp học sinh, xem liên hệ phụ huynh và mở khoá game cho lớp mình',
      permissions: ['class.changeStudentClass', 'students.viewParentContact', 'games.unlock'],
    },
    {
      name: 'Quản lý game',
      description: 'Sửa catalog game và mở khoá game',
      permissions: ['games.manage', 'games.unlock'],
    },
  ];
  for (const g of groups) {
    await prisma.permissionGroup.upsert({
      where: { name: g.name },
      update: {},
      create: { ...g, isSystem: true },
    });
  }
  console.log(`[seed] permission groups: ${groups.map((g) => g.name).join(', ')}`);
}
