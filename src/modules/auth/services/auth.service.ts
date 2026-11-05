import { Injectable } from '@nestjs/common';
import {
  type ChangePasswordBody,
  type GoogleBody,
  type LoginBody,
  type MeResponse,
  type Role,
  type UserStatus,
} from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { AUTH } from '@/config/constants';
import { PrismaService } from '@/database/prisma.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { PermissionsService } from '@/modules/permissions/services/permissions.service';
import { UsersService } from '@/modules/users/services/users.service';
import { type AuthResult, type AuthUser, type ClientMeta } from '@/modules/auth/types/auth.types';
import { type GoogleIdentity, GoogleService } from '@/modules/auth/services/google.service';
import { GoogleLinkService } from '@/modules/auth/services/google-link.service';
import { PasswordService } from '@/modules/auth/services/password.service';
import { type IssuedTokens, TokenService } from '@/modules/auth/services/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly google: GoogleService,
    private readonly googleLinks: GoogleLinkService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  async login(body: LoginBody, meta: ClientMeta): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    // Không tiết lộ email có tồn tại hay không
    if (!user || !(await this.passwords.verify(user.passwordHash, body.password))) {
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    this.assertCanSignIn(user);
    return this.startSession(user.id, meta);
  }

  /**
   * Google: có user theo googleSub → đăng nhập; có user trùng email → liên kết Google vào user đó rồi đăng nhập
   * (`GoogleLinkService.linkByEmail`, không báo trùng email); chưa có:
   *  - `app: 'admin'` → tạo yêu cầu tài khoản giáo viên PENDING, trả 403 ACCOUNT_PENDING (admin duyệt ở trang Giáo viên)
   *  - game → 422 PROFILE_REQUIRED để client mở màn đăng ký gia đình (`auth/register-family` với Google)
   */
  async googleSignIn(body: GoogleBody, meta: ClientMeta): Promise<AuthResult> {
    const identity = await this.google.verify(body.idToken);
    const bySub = await this.prisma.user.findUnique({ where: { googleSub: identity.sub } });
    if (bySub) {
      this.assertCanSignIn(bySub);
      return this.startSession(bySub.id, meta);
    }
    const byEmail = await this.prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail) {
      // Tài khoản bị khoá / từ chối: báo lỗi, không liên kết
      if (byEmail.status === 'DISABLED' || byEmail.status === 'REJECTED') this.assertCanSignIn(byEmail);
      await this.googleLinks.linkByEmail(byEmail, identity);
      this.assertCanSignIn(byEmail);
      return this.startSession(byEmail.id, meta);
    }

    if (body.app === 'admin') return this.requestStaffAccount(identity);
    throw new AppError('PROFILE_REQUIRED', 422);
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
    const [view, permissions, actor] = await Promise.all([
      this.users.view(user.id),
      this.permissions.effectiveFor(user),
      user.actorId
        ? this.prisma.user.findUnique({
            where: { id: user.actorId },
            select: { id: true, displayName: true },
          })
        : null,
    ]);
    return { user: view, permissions: [...permissions], actor };
  }

  async changePassword(user: AuthUser, body: ChangePasswordBody): Promise<void> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    // Bé không có mật khẩu riêng (phiên do phụ huynh mở) — đổi mật khẩu của phụ huynh
    if (row.role === 'STUDENT') throw new AppError('STUDENT_LOGIN_DISABLED', 403);
    if (row.passwordHash) {
      if (!body.currentPassword || !(await this.passwords.verify(row.passwordHash, body.currentPassword))) {
        throw new AppError('INVALID_CREDENTIALS', 401, { message: 'wrongCurrentPassword' });
      }
    }
    const passwordHash = await this.passwords.hash(body.newPassword);
    // Mật khẩu đổi → mọi phiên khác phải đăng nhập lại (cùng transaction)
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await this.tokens.revokeAll(user.id, tx);
    });
  }

  // ---- helpers ----

  /**
   * Đăng nhập Google ở trang admin bằng email chưa có tài khoản → giáo viên PENDING (chưa có lớp), chờ admin duyệt.
   * Giới hạn số yêu cầu đang chờ để chặn spam tạo tài khoản.
   */
  private async requestStaffAccount(identity: GoogleIdentity): Promise<never> {
    const pending = await this.prisma.user.count({ where: { role: 'TEACHER', status: 'PENDING' } });
    if (pending >= AUTH.maxPendingStaffRequests) throw new AppError('RATE_LIMITED', 429);
    const displayName = (identity.name?.trim() || identity.email.split('@')[0]).slice(0, 30);
    const user = await this.prisma.user.create({
      data: {
        email: identity.email,
        googleSub: identity.sub,
        emailVerified: true,
        provider: 'GOOGLE',
        role: 'TEACHER',
        status: 'PENDING',
        displayName,
      },
      select: { id: true },
    });
    await this.audit.record(null, 'teacher.request', 'User', user.id, null, { email: identity.email });
    throw new AppError('ACCOUNT_PENDING', 403, { message: 'staffRequestCreated' });
  }

  /**
   * Chặn đăng nhập: học sinh không tự đăng nhập (phiên bé chỉ mở qua `switch-profile`); theo trạng thái — PARENT chờ
   * duyệt vẫn vào được (màn "đang chờ duyệt"), giáo viên chờ duyệt thì không.
   */
  private assertCanSignIn(user: { role: Role; status: UserStatus }): void {
    if (user.role === 'STUDENT') throw new AppError('STUDENT_LOGIN_DISABLED', 403);
    if (user.status === 'DISABLED') throw new AppError('ACCOUNT_DISABLED', 403);
    if (user.status === 'REJECTED') throw new AppError('ACCOUNT_REJECTED', 403);
    if (user.status === 'PENDING' && user.role !== 'PARENT') throw new AppError('ACCOUNT_PENDING', 403);
  }

  /**
   * Cấp cặp token + view user (đăng nhập, đăng ký, đặt mật khẩu, chuyển hồ sơ bé). `actorId` = phụ huynh mở phiên
   * cho bé → access token mang claim `act`. `lastLoginAt` của bé = lần gần nhất hồ sơ bé được mở.
   */
  async startSession(
    userId: string,
    meta: ClientMeta,
    extra: { created?: boolean; actorId?: string } = {},
  ): Promise<AuthResult> {
    const { actorId, ...flags } = extra;
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
      select: { id: true, role: true, tokenVersion: true },
    });
    const tokens: IssuedTokens = await this.tokens.issue({ ...row, actorId }, meta);
    const user = await this.users.view(userId);
    return { ...tokens, user, ...flags };
  }
}
