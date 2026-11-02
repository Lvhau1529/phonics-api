import { Injectable, Logger } from '@nestjs/common';
import { type SetPasswordBody } from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { dayjs } from '@/core/time/dayjs';
import { AuthService } from '@/modules/auth/services/auth.service';
import { PasswordService } from '@/modules/auth/services/password.service';
import { type AuthResult, type AuthUser, type ClientMeta } from '@/modules/auth/types/auth.types';
import { FamilyRepository } from '@/modules/families/repositories/family.repository';
import { hashToken } from '@/common/utils/hash-token';

/** Phiên của tài khoản gia đình: vào hồ sơ bé (token học sinh có claim `act`), đặt mật khẩu từ link mời */
@Injectable()
export class FamilySessionService {
  private readonly logger = new Logger(FamilySessionService.name);

  constructor(
    private readonly repo: FamilyRepository,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

  /** Phụ huynh (ACTIVE) mở hồ sơ một bé được phép vào và đã được duyệt */
  async switchProfile(user: AuthUser, studentId: string, meta: ClientMeta): Promise<AuthResult> {
    const link = await this.repo.findAccessLink(user.id, studentId);
    if (!link?.canAccess) throw new AppError('PROFILE_NOT_ACCESSIBLE', 403);
    const status = link.student.user.status;
    if (status === 'PENDING') throw new AppError('PROFILE_NOT_APPROVED', 403);
    if (status !== 'ACTIVE' || user.status !== 'ACTIVE') throw new AppError('PROFILE_NOT_ACCESSIBLE', 403);
    this.logger.log(`switch-profile parent=${user.id} student=${studentId}`);
    return this.auth.startSession(studentId, meta, { actorId: user.id });
  }

  /** Đặt mật khẩu lần đầu bằng token trong mail mời → đăng nhập luôn */
  async setPassword(body: SetPasswordBody, meta: ClientMeta): Promise<AuthResult> {
    const token = await this.repo.findAuthToken(hashToken(body.token));
    if (!token || token.purpose !== 'INVITE' || token.usedAt || dayjs(token.expiresAt).isBefore(dayjs())) {
      throw new AppError('INVITE_TOKEN_INVALID', 400);
    }
    const passwordHash = await this.passwords.hash(body.password);
    const now = new Date();
    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.consumeAuthToken(tx, token.id, now)))
        throw new AppError('INVITE_TOKEN_INVALID', 400);
      await this.repo.setPassword(tx, token.userId, passwordHash, now);
    });
    const user = await this.repo.findUserStatus(token.userId);
    if (user?.status === 'DISABLED') throw new AppError('ACCOUNT_DISABLED', 403);
    return this.auth.startSession(token.userId, meta);
  }
}
