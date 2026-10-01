import { Inject, Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../common/errors/app-error';
import { ENV } from '../config/env.module';
import { type Env } from '../config/env.schema';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

/** Xác thực ID token của Google Identity Services (client lấy token, server verify với các client id cho phép) */
@Injectable()
export class GoogleService {
  private readonly client = new OAuth2Client();

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled(): boolean {
    return this.env.GOOGLE_CLIENT_IDS.length > 0;
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.enabled)
      throw new AppError('GOOGLE_TOKEN_INVALID', 400, { message: 'Đăng nhập Google chưa được bật' });
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.env.GOOGLE_CLIENT_IDS });
      payload = ticket.getPayload();
    } catch {
      throw new AppError('GOOGLE_TOKEN_INVALID', 401);
    }
    if (!payload?.sub || !payload.email) throw new AppError('GOOGLE_TOKEN_INVALID', 401);
    if (!payload.email_verified) throw new AppError('GOOGLE_EMAIL_UNVERIFIED', 401);
    return { sub: payload.sub, email: payload.email.trim().toLowerCase(), name: payload.name };
  }
}
