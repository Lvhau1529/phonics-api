import {
  API_ROOT,
  REFRESH_COOKIE_NAME,
  REFRESH_TRANSPORT_HEADER,
  type RefreshTransport,
} from '@phonics/contracts';
import { type CookieOptions, type Request, type Response } from 'express';
import { API_V1 } from '../../../config/api-version';
import { type Env } from '../../../config/env.schema';

/**
 * Client chọn cách nhận refresh token:
 *  - cookie (mặc định): httpOnly, chỉ gửi tới nhóm route auth của version này (/api/v1/auth)
 *  - body: header `X-Refresh-Transport: body` → token nằm trong JSON, client tự lưu (PWA khác domain)
 */
export function transportOf(req: Request): RefreshTransport {
  const h = req.headers[REFRESH_TRANSPORT_HEADER.toLowerCase()];
  return (Array.isArray(h) ? h[0] : h)?.toLowerCase() === 'body' ? 'body' : 'cookie';
}

/** Cookie refresh chỉ đi kèm request tới /api/v1/auth/* (refresh, logout) */
const REFRESH_COOKIE_PATH = `${API_ROOT}/v${API_V1}/auth`;

export function cookieOptions(env: Env, maxAgeMs: number): CookieOptions {
  const production = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    domain: env.COOKIE_DOMAIN,
    signed: true,
    maxAge: maxAgeMs,
  };
}

export function setRefreshCookie(res: Response, env: Env, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions(env, env.REFRESH_TTL_DAYS * 24 * 3600 * 1000));
}

export function clearRefreshCookie(res: Response, env: Env): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...cookieOptions(env, 0), maxAge: undefined });
}

/** Refresh token do client gửi: body (transport body) hoặc cookie đã ký */
export function presentedRefreshToken(req: Request, bodyToken?: string): string | undefined {
  if (bodyToken) return bodyToken;
  const signed = (req as Request & { signedCookies?: Record<string, string | false> }).signedCookies;
  const value = signed?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value ? value : undefined;
}
