import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { type Request } from 'express';
import { PrismaService } from '@/database/prisma.service';
import { type AccessTokenPayload, type AuthUser } from '@/modules/auth/types/auth.types';
import { ALLOW_PENDING_KEY } from '@/common/decorators/account.decorator';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from '@/common/decorators/public.decorator';
import { AppError } from '@/common/errors/app-error';

/**
 * Guard toàn cục #1: đọc `Authorization: Bearer <access>`, kiểm tra chữ ký + tokenVersion + trạng thái user,
 * gắn `req.user: AuthUser`. Route @Public bỏ qua; @OptionalAuth chỉ gắn user nếu token hợp lệ. Tài khoản PENDING chỉ
 * gọi được route `@AllowPending`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, targets);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractBearer(req);

    if (!token) {
      if (isPublic || optional) return true;
      throw new AppError('UNAUTHORIZED', 401);
    }

    let user: AuthUser;
    try {
      user = await this.resolveUser(token);
    } catch (e) {
      if (isPublic || optional) return true; // token hỏng ở route public: coi như khách
      throw e;
    }
    // Chờ duyệt: chỉ các route của màn "đang chờ duyệt"; route public / tuỳ chọn đăng nhập coi như khách
    if (user.status === 'PENDING' && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_KEY, targets)) {
      if (isPublic || optional) return true;
      throw new AppError('ACCOUNT_PENDING', 403);
    }
    req.user = user;
    return true;
  }

  private async resolveUser(token: string): Promise<AuthUser> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch (e) {
      const expired = e instanceof Error && e.name === 'TokenExpiredError';
      throw new AppError(expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED', 401);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });
    if (!user || user.tokenVersion !== payload.tv) throw new AppError('UNAUTHORIZED', 401);
    if (user.status === 'DISABLED') throw new AppError('ACCOUNT_DISABLED', 403);
    if (user.status === 'REJECTED') throw new AppError('ACCOUNT_REJECTED', 403);
    return { ...user, actorId: payload.act?.sub ?? null };
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
