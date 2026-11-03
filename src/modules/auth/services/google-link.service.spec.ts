import { beforeEach, describe, expect, it } from 'vitest';
import { type DeepMockProxy, mock, mockDeep } from 'vitest-mock-extended';
import { type AppError } from '@/common/errors/app-error';
import { type PrismaService } from '@/database/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { GoogleLinkService, type LinkableUser } from '@/modules/auth/services/google-link.service';
import { type GoogleService } from '@/modules/auth/services/google.service';
import { type TokenService } from '@/modules/auth/services/token.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type UsersService } from '@/modules/users/services/users.service';

const identity = { sub: 'g-1', email: 'lan@example.vn', name: 'Lan' };
const actor: AuthUser = { id: 'u1', role: 'PARENT', status: 'ACTIVE', tokenVersion: 0 };

function linkable(over: Partial<LinkableUser> = {}): LinkableUser {
  return { id: 'u1', status: 'ACTIVE', emailVerified: true, passwordHash: 'hash', googleSub: null, ...over };
}

function selfRow(over: Record<string, unknown> = {}) {
  const row = {
    id: 'u1',
    email: 'lan@example.vn',
    loginMode: 'OWN',
    passwordHash: 'hash',
    googleSub: null,
    ...over,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return row as any;
}

describe('GoogleLinkService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let google: ReturnType<typeof mock<GoogleService>>;
  let tokens: ReturnType<typeof mock<TokenService>>;
  let users: ReturnType<typeof mock<UsersService>>;
  let audit: ReturnType<typeof mock<AuditService>>;
  let svc: GoogleLinkService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    google = mock<GoogleService>();
    tokens = mock<TokenService>();
    users = mock<UsersService>();
    audit = mock<AuditService>();
    google.verify.mockResolvedValue(identity);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    users.view.mockResolvedValue({ id: 'u1' } as any);
    svc = new GoogleLinkService(prisma, google, tokens, users, audit);
  });

  describe('linkByEmail (đăng nhập Google, email trùng)', () => {
    it('tài khoản đã xác nhận email → gắn Google, giữ mật khẩu và phiên', async () => {
      await svc.linkByEmail(linkable(), identity);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { googleSub: 'g-1', emailVerified: true },
      });
      expect(tokens.revokeAll).not.toHaveBeenCalled();
    });

    it('chưa xác nhận email, đã duyệt → gắn Google + thu hồi mọi phiên, giữ mật khẩu', async () => {
      await svc.linkByEmail(linkable({ emailVerified: false }), identity);
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ googleSub: 'g-1', emailVerified: true });
      expect(tokens.revokeAll).toHaveBeenCalledWith('u1');
    });

    it('chưa xác nhận email, còn chờ duyệt → xoá mật khẩu do người khác có thể đã đặt', async () => {
      await svc.linkByEmail(linkable({ emailVerified: false, status: 'PENDING' }), identity);
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        googleSub: 'g-1',
        emailVerified: true,
        passwordHash: null,
      });
      expect(tokens.revokeAll).toHaveBeenCalledWith('u1');
    });

    it('đã gắn Google khác → GOOGLE_ALREADY_LINKED, không ghi đè', async () => {
      await expect(svc.linkByEmail(linkable({ googleSub: 'g-other' }), identity)).rejects.toMatchObject({
        code: 'GOOGLE_ALREADY_LINKED',
      } satisfies Partial<AppError>);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('thua cuộc đua unique google_sub → GOOGLE_ALREADY_LINKED', async () => {
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
      );
      await expect(svc.linkByEmail(linkable(), identity)).rejects.toMatchObject({
        code: 'GOOGLE_ALREADY_LINKED',
      } satisfies Partial<AppError>);
    });
  });

  describe('link (đang đăng nhập)', () => {
    it('gắn Google; email Google trùng email tài khoản → xác nhận email', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(selfRow());
      prisma.user.findUnique.mockResolvedValue(null);
      await svc.link(actor, 'id-token');
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ googleSub: 'g-1', emailVerified: true });
      expect(audit.record).toHaveBeenCalledWith(actor, 'user.linkGoogle', 'User', 'u1', null, {
        via: 'profile',
      });
    });

    it('Google đã thuộc user khác → GOOGLE_ALREADY_LINKED', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(selfRow());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' } as any);
      await expect(svc.link(actor, 'id-token')).rejects.toMatchObject({ code: 'GOOGLE_ALREADY_LINKED' });
    });

    it('phụ huynh đang mở hồ sơ bé → FORBIDDEN', async () => {
      await expect(svc.link({ ...actor, actorId: 'p1' }, 'id-token')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('unlink', () => {
    it('chưa có mật khẩu → LAST_LOGIN_METHOD', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(selfRow({ googleSub: 'g-1', passwordHash: null }));
      await expect(svc.unlink(actor)).rejects.toMatchObject({ code: 'LAST_LOGIN_METHOD' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('còn mật khẩu → gỡ googleSub', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(selfRow({ googleSub: 'g-1' }));
      await svc.unlink(actor);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { googleSub: null } });
    });
  });
});
