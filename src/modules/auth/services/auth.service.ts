import { Injectable } from '@nestjs/common';
import {
  type ChangePasswordBody,
  DEFAULT_AVATAR,
  type GoogleBody,
  type GoogleProfile,
  type LoginBody,
  type MeResponse,
  type ParentContact,
  type RegisterBody,
  type Role,
  type UserStatus,
} from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { normalizePhone } from '@/common/utils/phone';
import { nameColumns, profileNameData } from '@/common/utils/student-names';
import { AUTH } from '@/config/constants';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
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

  /**
   * Học sinh tự đăng ký kiểu cũ (game < 1.7.0; game mới dùng `auth/register-family`). Tài khoản tạo ở trạng thái
   * PENDING, chưa vào lớp (lớp chọn lưu ở `requested_class_id`) → báo 403 ACCOUNT_PENDING thay vì cấp token.
   */
  async register(body: RegisterBody): Promise<never> {
    await this.assertEmailFree(body.email);
    const passwordHash = await this.passwords.hash(body.password);
    await this.prisma.$transaction((tx) =>
      this.createPendingStudent(tx, {
        email: body.email,
        passwordHash,
        provider: 'LOCAL',
        displayName: body.displayName,
        avatarKey: body.avatarKey ?? DEFAULT_AVATAR,
        classId: body.classId,
        parent: body.parent,
      }),
    );
    throw new AppError('ACCOUNT_PENDING', 403, { message: 'accountCreatedPending' });
  }

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
   *  - game → 422 PROFILE_REQUIRED để client mở màn đăng ký (`auth/register-family` với Google). Client cũ gửi kèm
   *    `profile` → tạo học sinh PENDING như `register`.
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
    if (!body.profile) throw new AppError('PROFILE_REQUIRED', 422);
    const profile: GoogleProfile = body.profile;
    await this.prisma.$transaction((tx) =>
      this.createPendingStudent(tx, {
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
    throw new AppError('ACCOUNT_PENDING', 403, { message: 'accountCreatedPending' });
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
    // Bé vào qua tài khoản gia đình không có mật khẩu riêng — đổi mật khẩu của phụ huynh
    if (row.loginMode === 'MANAGED') throw new AppError('STUDENT_IS_MANAGED', 409);
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

  private async assertEmailFree(email: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists)
      throw new AppError('EMAIL_TAKEN', 409, {
        message: 'emailTakenSignIn',
        fieldErrors: { email: ['EMAIL_TAKEN'] },
      });
  }

  /** Chặn đăng nhập theo trạng thái. PARENT chờ duyệt vẫn vào được (màn "đang chờ duyệt"); học sinh chờ duyệt thì không. */
  private assertCanSignIn(user: { role: Role; status: UserStatus }): void {
    if (user.status === 'DISABLED') throw new AppError('ACCOUNT_DISABLED', 403);
    if (user.status === 'REJECTED') throw new AppError('ACCOUNT_REJECTED', 403);
    if (user.status === 'PENDING' && user.role !== 'PARENT') throw new AppError('ACCOUNT_PENDING', 403);
  }

  /** Học sinh tự đăng ký kiểu cũ: PENDING, OWN, chưa vào lớp (chờ duyệt ở màn Duyệt tài khoản) */
  private async createPendingStudent(
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
        fieldErrors: { classId: ['CLASS_NOT_JOINABLE'] },
      });

    // Form đăng ký chỉ có một ô tên → coi là tên tiếng Việt; tên tiếng Anh GV / admin bổ sung sau
    const names = nameColumns({ vietnameseName: input.displayName, englishName: null });
    const student = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        provider: input.provider,
        googleSub: input.googleSub,
        emailVerified: input.emailVerified ?? false,
        role: 'STUDENT',
        status: 'PENDING',
        displayName: names.displayName,
        avatarKey: input.avatarKey,
        studentProfile: {
          create: {
            ...profileNameData(names),
            requestedClassId: input.classId,
          },
        },
      },
    });
    if (input.parent && (input.parent.name || input.parent.email || input.parent.phone)) {
      await this.linkBillingGuardian(tx, student.id, input.parent, names.vietnameseName);
    }
  }

  /** Liên hệ phụ huynh khai lúc đăng ký → phụ huynh nhận học phí (gắn vào phụ huynh sẵn có nếu trùng email) */
  private async linkBillingGuardian(
    tx: Tx,
    studentId: string,
    parent: ParentContact,
    vietnameseName: string,
  ): Promise<void> {
    const existing = parent.email
      ? await tx.guardian.findFirst({ where: { email: parent.email }, select: { id: true } })
      : null;
    const guardianId =
      existing?.id ??
      (
        await tx.guardian.create({
          data: {
            fullName: parent.name ?? `Phụ huynh ${vietnameseName}`.slice(0, 60),
            email: parent.email ?? null,
            phone: parent.phone ? normalizePhone(parent.phone) : null,
          },
          select: { id: true },
        })
      ).id;
    await tx.studentGuardian.create({ data: { studentId, guardianId, isBillingContact: true } });
  }

  /**
   * Cấp cặp token + view user (đăng nhập, đăng ký, đặt mật khẩu, chuyển hồ sơ bé). `actorId` = phụ huynh mở phiên
   * cho bé → access token mang claim `act`.
   */
  async startSession(
    userId: string,
    meta: ClientMeta,
    extra: { created?: boolean; actorId?: string } = {},
  ): Promise<AuthResult> {
    const { actorId, ...flags } = extra;
    const row = await this.prisma.user.update({
      where: { id: userId },
      // Phụ huynh mở hồ sơ bé không tính là bé đăng nhập
      data: actorId ? {} : { lastLoginAt: new Date() },
      select: { id: true, role: true, tokenVersion: true },
    });
    const tokens: IssuedTokens = await this.tokens.issue({ ...row, actorId }, meta);
    const user = await this.users.view(userId);
    return { ...tokens, user, ...flags };
  }
}
