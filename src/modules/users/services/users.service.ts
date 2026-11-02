import { Injectable } from '@nestjs/common';
import { AvatarKey, DEFAULT_AVATAR, type UpdateProfileBody, type User } from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import {
  applyNameChange,
  nameColumns,
  profileNameData,
  type StudentNameColumns,
} from '@/common/utils/student-names';
import { PrismaService } from '@/database/prisma.service';
import { type Prisma } from '@/generated/prisma/client';

export const userViewInclude = {
  studentProfile: {
    select: {
      vietnameseName: true,
      englishName: true,
      memberships: {
        where: { leftAt: null },
        take: 1,
        select: {
          joinedAt: true,
          class: { select: { id: true, name: true, grade: true, schoolYear: true } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userViewInclude }>;

/** Chuyển row Prisma → contracts.User (không lộ hash / token) */
export function toUserView(row: UserRow): User {
  const membership = row.studentProfile?.memberships[0];
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    provider: row.provider,
    displayName: row.displayName,
    avatarKey: AvatarKey.safeParse(row.avatarKey).data ?? DEFAULT_AVATAR,
    class: membership ? { ...membership.class, joinedAt: membership.joinedAt.toISOString() } : null,
    createdAt: row.createdAt.toISOString(),
    loginMode: row.loginMode,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async view(id: string): Promise<User> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: userViewInclude });
    if (!row) throw notFound('userNotFound');
    return toUserView(row);
  }

  /** Học sinh / GV tự sửa profile (email phải chưa ai dùng) */
  async updateProfile(id: string, body: UpdateProfileBody): Promise<User> {
    if (body.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: body.email, NOT: { id } },
        select: { id: true },
      });
      if (taken) throw new AppError('EMAIL_TAKEN', 409, { fieldErrors: { email: ['EMAIL_TAKEN'] } });
    }
    const names = body.displayName !== undefined ? await this.studentNameChange(id, body.displayName) : null;
    const row = await this.prisma.user.update({
      where: { id },
      data: {
        // Học sinh: tên hiển thị suy ra từ tên tiếng Việt / tiếng Anh; GV / admin: ghi thẳng
        displayName: names ? names.displayName : body.displayName,
        studentProfile: names ? { update: profileNameData(names) } : undefined,
        avatarKey: body.avatarKey,
        email: body.email,
        // Đổi email bằng tay → chưa xác thực lại
        emailVerified: body.email ? false : undefined,
      },
      include: userViewInclude,
    });
    return toUserView(row);
  }

  /**
   * Học sinh đổi tên trong game (một ô tên) = đổi tên đang hiển thị: tên tiếng Anh nếu có, không thì tên tiếng Việt.
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
