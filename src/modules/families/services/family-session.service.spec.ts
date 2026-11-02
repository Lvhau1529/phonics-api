import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type AuthService } from '@/modules/auth/services/auth.service';
import { type PasswordService } from '@/modules/auth/services/password.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type FamilyRepository } from '@/modules/families/repositories/family.repository';
import { hashToken } from '@/common/utils/hash-token';
import { FamilySessionService } from '@/modules/families/services/family-session.service';

const parent: AuthUser = { id: 'p1', role: 'PARENT', status: 'ACTIVE', tokenVersion: 0 };

function setup() {
  const repo = mockDeep<FamilyRepository>();
  const auth = mockDeep<AuthService>();
  const service = new FamilySessionService(repo, auth, mockDeep<PasswordService>());
  return { repo, auth, service };
}

function link(canAccess: boolean, status: string) {
  return { canAccess, student: { user: { status } } } as never;
}

describe('FamilySessionService', () => {
  it('switchProfile: không liên kết / không được vào → PROFILE_NOT_ACCESSIBLE', async () => {
    const { repo, auth, service } = setup();
    repo.findAccessLink.mockResolvedValueOnce(null).mockResolvedValueOnce(link(false, 'ACTIVE'));
    await expect(service.switchProfile(parent, 's1', {})).rejects.toMatchObject({
      code: 'PROFILE_NOT_ACCESSIBLE',
    });
    await expect(service.switchProfile(parent, 's1', {})).rejects.toMatchObject({
      code: 'PROFILE_NOT_ACCESSIBLE',
    });
    expect(auth.startSession).not.toHaveBeenCalled();
  });

  it('switchProfile: bé chờ duyệt → PROFILE_NOT_APPROVED; bé ACTIVE → phiên học sinh có actorId', async () => {
    const { repo, auth, service } = setup();
    repo.findAccessLink
      .mockResolvedValueOnce(link(true, 'PENDING'))
      .mockResolvedValueOnce(link(true, 'ACTIVE'));
    await expect(service.switchProfile(parent, 's1', {})).rejects.toMatchObject({
      code: 'PROFILE_NOT_APPROVED',
    });
    await service.switchProfile(parent, 's1', { ip: '1.1.1.1' });
    expect(auth.startSession).toHaveBeenCalledWith('s1', { ip: '1.1.1.1' }, { actorId: 'p1' });
  });

  it('setPassword: token lạ / đã dùng / hết hạn → INVITE_TOKEN_INVALID', async () => {
    const { repo, service } = setup();
    const base = { id: 't1', userId: 'p1', purpose: 'INVITE' as const, usedAt: null };
    repo.findAuthToken
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...base, usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) })
      .mockResolvedValueOnce({ ...base, expiresAt: new Date(Date.now() - 1) });
    for (let i = 0; i < 3; i++) {
      await expect(
        service.setPassword({ token: 'x'.repeat(40), password: 'secret1' }, {}),
      ).rejects.toMatchObject({ code: 'INVITE_TOKEN_INVALID' });
    }
    expect(repo.findAuthToken).toHaveBeenCalledWith(hashToken('x'.repeat(40)));
    expect(repo.transaction).not.toHaveBeenCalled();
  });
});
