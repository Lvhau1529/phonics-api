import { Injectable } from '@nestjs/common';
import { type UpdateProfileBody, type User } from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import {
  applyNameChange,
  nameColumns,
  profileNameData,
  type StudentNameColumns,
} from '@/common/utils/student-names';
import { PrismaService } from '@/database/prisma.service';
import { toUserView } from '@/modules/users/dto/responses/user.view';
import { userViewInclude } from '@/modules/users/types/user.types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async view(id: string): Promise<User> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: userViewInclude });
    if (!row) throw notFound('userNotFound');
    return toUserView(row);
  }

  /** Tự sửa tên / avatar (nhân viên, phụ huynh, hồ sơ bé trong phiên phụ huynh mở) */
  async updateProfile(id: string, body: UpdateProfileBody): Promise<User> {
    const names = body.displayName !== undefined ? await this.studentNameChange(id, body.displayName) : null;
    const row = await this.prisma.user.update({
      where: { id },
      data: {
        // Học sinh: tên hiển thị suy ra từ tên tiếng Việt / tiếng Anh; GV / admin: ghi thẳng
        displayName: names ? names.displayName : body.displayName,
        studentProfile: names ? { update: profileNameData(names) } : undefined,
        avatarKey: body.avatarKey,
      },
      include: userViewInclude,
    });
    return toUserView(row);
  }

  /**
   * Đổi tên của hồ sơ bé (một ô tên) = đổi tên đang hiển thị: tên tiếng Anh nếu có, không thì tên tiếng Việt.
   * null = không phải học sinh (hoặc chưa có profile) → ghi thẳng `display_name`.
   */
  private async studentNameChange(id: string, displayName: string): Promise<StudentNameColumns | null> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: id },
      select: { vietnameseName: true, englishName: true },
    });
    if (!profile) return null;
    return nameColumns(applyNameChange(profile, { displayName }) ?? profile);
  }
}
