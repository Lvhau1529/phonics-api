import { Injectable } from '@nestjs/common';
import {
  type AuthResponse,
  type ChangePasswordBody,
  DEFAULT_AVATAR,
  type GoogleBody,
  type GoogleProfile,
  type LoginBody,
  type MeResponse,
  type ParentContact,
  type RegisterBody,
} from '@phonics/contracts';
import { AppError } from '../common/errors/app-error';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { type Tx } from '../prisma/types';
import { RankingService } from '../points/ranking.service';
import { UsersService } from '../users/users.service';
import { type AuthUser } from './auth.types';
import { GoogleService } from './google.service';
import { PasswordService } from './password.service';
import { type IssuedTokens, TokenService } from './token.service';

interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export type AuthResult = Omit<AuthResponse, 'refreshToken'> & { refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly google: GoogleService,
    private readonly permissions: PermissionsService,
    private readonly ranking: RankingService,
  ) {}

  /** Học sinh tự đăng ký (phải chọn lớp đang nhận) */
  async register(body: RegisterBody, meta: ClientMeta): Promise<AuthResult> {
    await this.assertEmailFree(body.email);
    const passwordHash = await this.passwords.hash(body.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await this.createStudent(tx, {
        email: body.email,
        passwordHash,
        provider: 'LOCAL',
        displayName: body.displayName,
        avatarKey: body.avatarKey ?? DEFAULT_AVATAR,
        classId: body.classId,
        parent: body.parent,
      });
      return created;
    });
    await this.ranking.recomputeAndNotify(this.prisma, body.classId);
    return this.finish(user.id, meta, { created: true });
  }

  async login(body: LoginBody, meta: ClientMeta): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    // Không tiết lộ email có tồn tại hay không
    if (!user || !(await this.passwords.verify(user.passwordHash, body.password))) {
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    if (user.status === 'DISABLED') throw new AppError('ACCOUNT_DISABLED', 403);
    return this.finish(user.id, meta);
  }

  /**
   * Google: có user (theo googleSub, rồi email) → đăng nhập + liên kết; chưa có → cần `profile` (lớp, tên)
   * để tạo học sinh, thiếu thì 422 PROFILE_REQUIRED để client mở màn đăng ký.
   */
  async googleSignIn(body: GoogleBody, meta: ClientMeta): Promise<AuthResult> {
    const identity = await this.google.verify(body.idToken);
    const existing =
      (await this.prisma.user.findUnique({ where: { googleSub: identity.sub } })) ??
      (await this.prisma.user.findUnique({ where: { email: identity.email } }));

    if (existing) {
      if (existing.status === 'DISABLED') throw new AppError('ACCOUNT_DISABLED', 403);
      if (existing.googleSub !== identity.sub) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { googleSub: identity.sub, emailVerified: true },
        });
      }
      return this.finish(existing.id, meta);
    }

    if (!body.profile) throw new AppError('PROFILE_REQUIRED', 422);
    const profile: GoogleProfile = body.profile;
    const user = await this.prisma.$transaction((tx) =>
      this.createStudent(tx, {
        email: identity.email,
        passwordHash: null,
        provider: 'GOOGLE',
        googleSub: identity.sub,
        emailVerified: true,
        displayName: profile.displayName,
        avatarKey: profile.avatarKey ?? DEFAULT_AVATAR,
        classId: profile.classId,
        parent: profile.parent,
      }),
    );
    await this.ranking.recomputeAndNotify(this.prisma, profile.classId);
    return this.finish(user.id, meta, { created: true });
  }

  async refresh(presented: string | undefined, meta: ClientMeta): Promise<AuthResult> {
    if (!presented) throw new AppError('INVALID_REFRESH', 401);
    const rotated = await this.tokens.rotate(presented, meta);
    const user = await this.users.view(rotated.userId);
    return { ...rotated, user };
  }

  async logout(
    presented: string | undefined,
    user: AuthUser | undefined,
    all: boolean | undefined,
  ): Promise<void> {
    if (all && user) {
      await this.tokens.revokeAll(user.id);
      return;
    }
    if (presented) await this.tokens.revokeByToken(presented);
  }

  async me(user: AuthUser): Promise<MeResponse> {
    const [view, permissions] = await Promise.all([
      this.users.view(user.id),
      this.permissions.effectiveFor(user),
    ]);
    return { user: view, permissions: [...permissions] };
  }

  async changePassword(user: AuthUser, body: ChangePasswordBody): Promise<void> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (row.passwordHash) {
      if (!body.currentPassword || !(await this.passwords.verify(row.passwordHash, body.currentPassword))) {
        throw new AppError('INVALID_CREDENTIALS', 401, { message: 'Mật khẩu hiện tại không đúng' });
      }
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(body.newPassword) },
    });
    // Mật khẩu đổi → mọi phiên khác phải đăng nhập lại
    await this.tokens.revokeAll(user.id);
  }

  // ---- helpers ----

  private async assertEmailFree(email: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) throw new AppError('EMAIL_TAKEN', 409, { details: { email: ['Email đã được sử dụng'] } });
  }

  private async createStudent(
    tx: Tx,
    input: {
      email: string;
      passwordHash: string | null;
      provider: 'LOCAL' | 'GOOGLE';
      googleSub?: string;
      emailVerified?: boolean;
      displayName: string;
      avatarKey: string;
      classId: string;
      parent?: ParentContact;
    },
  ) {
    const cls = await tx.class.findUnique({
      where: { id: input.classId },
      select: { joinVisible: true, archivedAt: true },
    });
    if (!cls || !cls.joinVisible || cls.archivedAt)
      throw new AppError('CLASS_NOT_JOINABLE', 400, {
        details: { classId: ['Lớp không nhận học sinh mới'] },
      });

    return tx.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        provider: input.provider,
        googleSub: input.googleSub,
        emailVerified: input.emailVerified ?? false,
        role: 'STUDENT',
        displayName: input.displayName,
        avatarKey: input.avatarKey,
        studentProfile: {
          create: {
            parentName: input.parent?.name,
            parentEmail: input.parent?.email,
            parentPhone: input.parent?.phone,
            memberships: { create: { classId: input.classId } },
          },
        },
      },
    });
  }

  private async finish(
    userId: string,
    meta: ClientMeta,
    extra: { created?: boolean } = {},
  ): Promise<AuthResult> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
      select: { id: true, role: true, tokenVersion: true },
    });
    const tokens: IssuedTokens = await this.tokens.issue(row, meta);
    const user = await this.users.view(userId);
    return { ...tokens, user, ...extra };
  }
}
