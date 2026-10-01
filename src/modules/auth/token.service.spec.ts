import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { type AppError } from '../../common/errors/app-error';
import { type Env } from '../../config/env.schema';
import { type PrismaService } from '../../core/database/prisma.service';
import { TokenService } from './token.service';

const env = { JWT_ACCESS_TTL: '15m', REFRESH_TTL_DAYS: 30 } as Env;
const user = { id: 'u1', role: 'STUDENT' as const, tokenVersion: 0, status: 'ACTIVE' as const };

describe('TokenService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let svc: TokenService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    svc = new TokenService(new JwtService({ secret: 'x'.repeat(32) }), prisma, env);
  });

  it('accessTtlSeconds đọc 15m = 900', () => {
    expect(svc.accessTtlSeconds).toBe(900);
  });

  it('issue: tạo refresh token mới (DB chỉ nhận hash) và access token JWT', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.refreshToken.create.mockResolvedValue({} as any);
    const tokens = await svc.issue(user);
    expect(tokens.accessToken.split('.')).toHaveLength(3);
    expect(tokens.refreshToken.length).toBeGreaterThan(30);
    const data = prisma.refreshToken.create.mock.calls[0][0].data as { tokenHash: string };
    expect(data.tokenHash).toBe(svc.hash(tokens.refreshToken));
    expect(data.tokenHash).not.toBe(tokens.refreshToken);
  });

  it('rotate: token đã thu hồi → thu hồi cả family và báo REFRESH_REUSED', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      familyId: 'f1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
      user,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 } as any);
    await expect(svc.rotate('old')).rejects.toMatchObject({
      code: 'REFRESH_REUSED',
    } satisfies Partial<AppError>);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'f1', revokedAt: null } }),
    );
  });

  it('rotate: token không tồn tại → INVALID_REFRESH', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(svc.rotate('nope')).rejects.toMatchObject({ code: 'INVALID_REFRESH' });
  });
});
