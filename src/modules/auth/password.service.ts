import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** Băm mật khẩu bằng argon2id với tham số tối thiểu OWASP khuyến nghị */
@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    if (!hash) return false;
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
