import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { AppError } from '../common/errors/app-error';
import { AUTH } from '../config/constants';
import { ENV } from '../config/env.module';
import { type Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { type AccessTokenPayload } from './auth.types';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** Giây */
  expiresIn: number;
}

interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Access token: JWT ngắn hạn (JWT_ACCESS_TTL) chứa { sub, role, tv }.
 * Refresh token: chuỗi ngẫu nhiên, DB chỉ lưu sha256; mỗi lần refresh tạo token mới cùng `familyId`
 * và thu hồi token cũ. Dùng lại token đã thu hồi = nghi bị đánh cắp → thu hồi cả family.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get accessTtlSeconds(): number {
    const m = /^(\d+)([smhd])$/.exec(this.env.JWT_ACCESS_TTL);
    if (!m) return 900;
    const n = Number(m[1]);
    return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  }

  signAccess(user: { id: string; role: AccessTokenPayload['role']; tokenVersion: number }): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, tv: user.tokenVersion };
    return this.jwt.signAsync(payload);
  }

  /** Đăng nhập mới: tạo family mới */
  async issue(
    user: { id: string; role: AccessTokenPayload['role']; tokenVersion: number },
    meta: ClientMeta = {},
  ): Promise<IssuedTokens> {
    const familyId = randomUUID();
    const refreshToken = await this.createRefresh(user.id, familyId, meta);
    return { accessToken: await this.signAccess(user), refreshToken, expiresIn: this.accessTtlSeconds };
  }

  /** Xoay vòng refresh token; trả về cặp token mới + userId */
  async rotate(presented: string, meta: ClientMeta = {}): Promise<IssuedTokens & { userId: string }> {
    const tokenHash = this.hash(presented);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!row) throw new AppError('INVALID_REFRESH', 401);

    if (row.revokedAt) {
      // Token đã dùng rồi mà vẫn được gửi lên → thu hồi cả family
      this.logger.warn(`Refresh token reuse: user=${row.userId} family=${row.familyId}`);
      await this.revokeFamily(row.familyId);
      throw new AppError('REFRESH_REUSED', 401);
    }
    if (row.expiresAt.getTime() < Date.now()) throw new AppError('INVALID_REFRESH', 401);
    if (row.user.status === 'DISABLED') throw new AppError('ACCOUNT_DISABLED', 403);

    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const next = await this.createRefresh(row.userId, row.familyId, meta, tx);
      await tx.refreshToken.update({
        where: { id: row.id },
        data: {
          revokedAt: new Date(),
          replacedById: (
            await tx.refreshToken.findUnique({ where: { tokenHash: this.hash(next) }, select: { id: true } })
          )?.id,
        },
      });
      return next;
    });

    return {
      userId: row.userId,
      accessToken: await this.signAccess(row.user),
      refreshToken,
      expiresIn: this.accessTtlSeconds,
    };
  }

  /** Đăng xuất thiết bị này: thu hồi family của token được gửi lên */
  async revokeByToken(presented: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(presented) } });
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Đăng xuất mọi thiết bị: thu hồi mọi refresh token + vô hiệu access token đang có */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
    ]);
  }

  /** Dọn token hết hạn lâu (4h sáng mỗi ngày) */
  @Cron('0 4 * * *')
  async cleanup(): Promise<void> {
    const before = new Date(Date.now() - AUTH.refreshCleanupAfterDays * DAY_MS);
    const { count } = await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: before } } });
    if (count) this.logger.log(`Đã xoá ${count} refresh token hết hạn`);
  }

  private async createRefresh(
    userId: string,
    familyId: string,
    meta: ClientMeta,
    tx: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ): Promise<string> {
    const token = randomBytes(AUTH.refreshTokenBytes).toString('base64url');
    await tx.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_DAYS * DAY_MS),
        userAgent: meta.userAgent?.slice(0, 200),
        ip: meta.ip,
      },
    });
    return token;
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
