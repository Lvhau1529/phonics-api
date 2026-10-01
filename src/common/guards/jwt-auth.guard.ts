import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { type Request } from 'express';
import { type AccessTokenPayload, type AuthUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from '../decorators/public.decorator';
import { AppError } from '../errors/app-error';

/**
 * Guard toàn cục #1: đọc `Authorization: Bearer <access>`, kiểm tra chữ ký + tokenVersion + trạng thái user,
 * gắn `req.user: AuthUser`. Route @Public bỏ qua; @OptionalAuth chỉ gắn user nếu token hợp lệ.
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

    try {
      req.user = await this.resolveUser(token);
      return true;
    } catch (e) {
      if (isPublic || optional) return true; // token hỏng ở route public: coi như khách
      throw e;
    }
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
    return user;
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
