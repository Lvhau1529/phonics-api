import { Injectable } from '@nestjs/common';
import { type User, type UserStatus } from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { PrismaService } from '@/database/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type GoogleIdentity, GoogleService } from '@/modules/auth/services/google.service';
import { TokenService } from '@/modules/auth/services/token.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { UsersService } from '@/modules/users/services/users.service';

/** Phần user cần để quyết định liên kết Google */
export interface LinkableUser {
  id: string;
  status: UserStatus;
  emailVerified: boolean;
  passwordHash: string | null;
  googleSub: string | null;
}

/** Tự đăng ký nhưng chưa được duyệt: mật khẩu có thể do người lạ đặt bằng email của chủ thật */
const UNREVIEWED: readonly UserStatus[] = ['PENDING', 'REJECTED'];

/**
 * Liên kết / gỡ Google của một tài khoản. Một tài khoản đăng nhập được bằng cả mật khẩu lẫn Google (cột `googleSub`).
 *
 * Chống chiếm tài khoản khi liên kết theo email: người lạ có thể tự đăng ký trước bằng email của nạn nhân. Google đã
 * xác thực email → chủ thật là người đang đăng nhập Google; nếu tài khoản chưa xác nhận email thì thu hồi mọi phiên cũ,
 * và nếu chưa được duyệt (chưa ai kiểm tra) thì xoá luôn mật khẩu cũ.
 */
@Injectable()
export class GoogleLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /** Đăng nhập Google, không có user theo `googleSub` nhưng có user trùng email → gắn Google vào user đó */
  async linkByEmail(user: LinkableUser, identity: GoogleIdentity): Promise<void> {
    if (user.googleSub === identity.sub) return;
    if (user.googleSub) {
      throw new AppError('GOOGLE_ALREADY_LINKED', 409, { message: 'accountLinkedToOtherGoogle' });
    }
    const untrusted = !user.emailVerified;
    const clearPassword = untrusted && !!user.passwordHash && UNREVIEWED.includes(user.status);
    await this.saveLink(user.id, {
      googleSub: identity.sub,
      emailVerified: true,
      ...(clearPassword ? { passwordHash: null } : {}),
    });
    // Phiên cũ có thể là của người đã đăng ký hộ → đăng xuất hết (bump tokenVersion), phiên mới cấp sau
    if (untrusted) await this.tokens.revokeAll(user.id);
    await this.audit.record({ id: user.id }, 'user.linkGoogle', 'User', user.id, null, {
      via: 'signIn',
      sessionsRevoked: untrusted,
      passwordCleared: clearPassword,
    });
  }

  /** Người đang đăng nhập tự liên kết Google (email Google có thể khác email tài khoản) */
  async link(actor: AuthUser, idToken: string): Promise<User> {
    const row = await this.findSelf(actor);
    const identity = await this.google.verify(idToken);
    if (row.googleSub === identity.sub) return this.users.view(row.id);
    if (row.googleSub) {
      throw new AppError('GOOGLE_ALREADY_LINKED', 409, { message: 'accountLinkedToOtherGoogle' });
    }
    const owner = await this.prisma.user.findUnique({
      where: { googleSub: identity.sub },
      select: { id: true },
    });
    if (owner) throw new AppError('GOOGLE_ALREADY_LINKED', 409);
    await this.saveLink(row.id, {
      googleSub: identity.sub,
      // Google chứng minh quyền sở hữu đúng email đăng nhập → coi như đã xác nhận email
      ...(identity.email === row.email ? { emailVerified: true } : {}),
    });
    await this.audit.record(actor, 'user.linkGoogle', 'User', row.id, null, { via: 'profile' });
    return this.users.view(row.id);
  }

  /** Gỡ Google; phải còn mật khẩu để không tự khoá mình ngoài */
  async unlink(actor: AuthUser): Promise<User> {
    const row = await this.findSelf(actor);
    if (row.googleSub) {
      if (!row.passwordHash) throw new AppError('LAST_LOGIN_METHOD', 409);
      await this.prisma.user.update({ where: { id: row.id }, data: { googleSub: null } });
      await this.audit.record(actor, 'user.unlinkGoogle', 'User', row.id, null, null);
    }
    return this.users.view(row.id);
  }

  // ---- helpers ----

  /** Chỉ chủ tài khoản tự đăng nhập; phụ huynh đang mở hồ sơ bé / bé MANAGED không có đăng nhập riêng */
  private async findSelf(actor: AuthUser) {
    if (actor.actorId) throw new AppError('FORBIDDEN', 403);
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (row.loginMode === 'MANAGED') throw new AppError('STUDENT_IS_MANAGED', 409);
    return row;
  }

  /** Thua cuộc đua unique `google_sub` (hai request cùng lúc) → báo đã liên kết nơi khác */
  private async saveLink(userId: string, data: Prisma.UserUpdateInput): Promise<void> {
    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('GOOGLE_ALREADY_LINKED', 409);
      }
      throw err;
    }
  }
}
