import { Injectable } from '@nestjs/common';
import { AvatarKey, type UpdateProfileBody, type User } from '@phonics/contracts';
import { AppError, notFound } from '../../common/errors/app-error';
import { PrismaService } from '../../core/database/prisma.service';
import { type Prisma } from '../../generated/prisma/client';

export const userViewInclude = {
  studentProfile: {
    select: {
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
    avatarKey: AvatarKey.safeParse(row.avatarKey).data ?? 'pip',
    class: membership ? { ...membership.class, joinedAt: membership.joinedAt.toISOString() } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async view(id: string): Promise<User> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: userViewInclude });
    if (!row) throw notFound('Không tìm thấy người dùng');
    return toUserView(row);
  }

  /** Học sinh / GV tự sửa profile (email phải chưa ai dùng) */
  async updateProfile(id: string, body: UpdateProfileBody): Promise<User> {
    if (body.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: body.email, NOT: { id } },
        select: { id: true },
      });
      if (taken) throw new AppError('EMAIL_TAKEN', 409, { details: { email: ['Email đã được sử dụng'] } });
    }
    const row = await this.prisma.user.update({
      where: { id },
      data: {
        displayName: body.displayName,
        avatarKey: body.avatarKey,
        email: body.email,
        // Đổi email bằng tay → chưa xác thực lại
        emailVerified: body.email ? false : undefined,
      },
      include: userViewInclude,
    });
    return toUserView(row);
  }
}
