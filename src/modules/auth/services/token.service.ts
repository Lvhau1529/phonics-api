import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { AppError } from '@/common/errors/app-error';
import { AUTH } from '@/config/constants';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type AccessTokenPayload } from '@/modules/auth/types/auth.types';
import { dayjs } from '@/core/time/dayjs';

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

/** User được cấp token; `actorId` = phụ huynh mở phiên cho bé (claim `act`) */
export interface TokenSubject {
  id: string;
  role: AccessTokenPayload['role'];
  tokenVersion: number;
  actorId?: string | null;
}

/**
 * Access token: JWT ngắn hạn (JWT_ACCESS_TTL) chứa { sub, role, tv, act? }.
 * Refresh token: chuỗi ngẫu nhiên, DB chỉ lưu sha256; mỗi lần refresh tạo token mới cùng `familyId`
 * và thu hồi token cũ. Dùng lại token đã thu hồi = nghi bị đánh cắp → thu hồi cả family.
 * Phiên phụ huynh mở cho bé: refresh token lưu `actorId`; mỗi lần xoay vòng kiểm tra lại liên kết phụ huynh ↔ bé.
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
    return dayjs.duration(Number(m[1]), m[2] as 's' | 'm' | 'h' | 'd').asSeconds();
  }

  signAccess(user: TokenSubject): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, tv: user.tokenVersion };
    if (user.actorId) payload.act = { sub: user.actorId };
    return this.jwt.signAsync(payload);
  }

  /** Đăng nhập mới: tạo family mới */
  async issue(user: TokenSubject, meta: ClientMeta = {}): Promise<IssuedTokens> {
    const familyId = randomUUID();
    const refreshToken = await this.createRefresh(user.id, familyId, meta, this.prisma, user.actorId);
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
    if (dayjs(row.expiresAt).isBefore(dayjs())) throw new AppError('INVALID_REFRESH', 401);
    if (row.user.status === 'DISABLED') throw new AppError('ACCOUNT_DISABLED', 403);
    if (row.user.status === 'REJECTED') throw new AppError('ACCOUNT_REJECTED', 403);
    if (row.actorId && !(await this.actorStillAllowed(row.actorId, row.userId))) {
      // Gỡ liên kết / khoá phụ huynh / bé hết ACTIVE → phiên của bé hết hiệu lực
      await this.revokeFamily(row.familyId);
      throw new AppError('INVALID_REFRESH', 401);
    }

    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const next = await this.createRefresh(row.userId, row.familyId, meta, tx, row.actorId);
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
      accessToken: await this.signAccess({ ...row.user, actorId: row.actorId }),
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

  /**
   * Đăng xuất mọi thiết bị: thu hồi mọi refresh token + vô hiệu access token đang có.
   * Truyền `tx` để chạy chung transaction của caller (vd đổi mật khẩu + thu hồi phiên).
   */
  async revokeAll(userId: string, tx?: Tx): Promise<void> {
    if (tx) {
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      return;
    }
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
    ]);
  }

  /** Phụ huynh còn được vào hồ sơ bé: liên kết `can_access`, phụ huynh ACTIVE, bé ACTIVE */
  private async actorStillAllowed(actorId: string, studentId: string): Promise<boolean> {
    const link = await this.prisma.studentGuardian.findFirst({
      where: {
        studentId,
        canAccess: true,
        guardian: { userId: actorId, user: { status: 'ACTIVE' } },
        student: { user: { status: 'ACTIVE' } },
      },
      select: { studentId: true },
    });
    return !!link;
  }

  /** Dọn token hết hạn lâu (4h sáng mỗi ngày) */
  @Cron('0 4 * * *')
  async cleanup(): Promise<void> {
    const before = dayjs().subtract(AUTH.refreshCleanupAfterDays, 'day').toDate();
    const { count } = await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: before } } });
    if (count) this.logger.log(`Đã xoá ${count} refresh token hết hạn`);
  }

  private async createRefresh(
    userId: string,
    familyId: string,
    meta: ClientMeta,
    tx: Pick<PrismaService, 'refreshToken'> = this.prisma,
    actorId?: string | null,
  ): Promise<string> {
    const token = randomBytes(AUTH.refreshTokenBytes).toString('base64url');
    await tx.refreshToken.create({
      data: {
        userId,
        familyId,
        actorId: actorId ?? null,
        tokenHash: this.hash(token),
        expiresAt: dayjs().add(this.env.REFRESH_TTL_DAYS, 'day').toDate(),
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
