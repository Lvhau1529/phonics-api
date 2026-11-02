import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { studentFullName } from '@phonics/contracts';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { dayjs } from '@/core/time/dayjs';
import { type Tx } from '@/database/types';
import { GuardianRepository } from '@/modules/families/repositories/guardian.repository';
import { INVITE_TTL_HOURS } from '@/modules/families/types/family.types';
import { MailOutboxService } from '@/modules/mail/services/mail-outbox.service';

/** Băm token một lần (DB chỉ lưu hash) */
export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Link mời đặt mật khẩu tài khoản gia đình (token một lần, INVITE_TTL_HOURS giờ) + mail `parent.invite` */
@Injectable()
export class FamilyInviteService {
  constructor(
    private readonly repo: GuardianRepository,
    private readonly mail: MailOutboxService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Xếp hàng mail mời trong transaction của caller; gọi `mail.flush()` sau commit (`flush` bên dưới) */
  async enqueue(
    tx: Tx,
    input: {
      userId: string;
      email: string;
      parentName: string;
      children: readonly { vietnameseName: string; englishName: string | null }[];
    },
  ): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const { id } = await this.repo.createAuthToken(tx, {
      userId: input.userId,
      tokenHash: hashAuthToken(token),
      expiresAt: dayjs().add(INVITE_TTL_HOURS, 'hour').toDate(),
    });
    await this.mail.enqueueTemplate(
      [
        {
          key: 'parent.invite',
          to: input.email,
          dedupeKey: `invite:${input.userId}:${id}`,
          refType: 'User',
          refId: input.userId,
          context: {
            parentName: input.parentName,
            childrenText: input.children.map(studentFullName).join(', '),
            link: `${this.env.GAME_APP_URL}/set-password?token=${token}`,
            expiresHours: INVITE_TTL_HOURS,
            email: input.email,
          },
        },
      ],
      tx,
    );
  }

  flush(): void {
    this.mail.flush();
  }
}
