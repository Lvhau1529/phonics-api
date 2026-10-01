import { POINT_RULES } from '@phonics/contracts';

export { POINT_RULES };

/** Giới hạn riêng từng game để chặn kết quả phi lý (thêm game mới: thêm dòng ở đây + GameId trong contracts) */
export const GAME_REGISTRY: Record<string, { maxTotal: number; maxScore: number }> = {
  'bread-catcher': { maxTotal: 60, maxScore: 60_000 },
  'food-stream': { maxTotal: 30, maxScore: 100_000 },
};

/** Khi nào tạo thông báo đổi hạng: 'all' mọi thay đổi, 'improve' chỉ khi lên hạng */
export const RANK_NOTIFY_POLICY: 'all' | 'improve' = 'all';

export const AUTH = {
  /** Số byte ngẫu nhiên của refresh token (base64url) */
  refreshTokenBytes: 32,
  /** Dọn refresh token hết hạn quá số ngày này */
  refreshCleanupAfterDays: 7,
  jwtIssuer: 'phonics-api',
  jwtAudience: 'phonics',
} as const;

export const THROTTLE = {
  default: { ttl: 60_000, limit: 120 },
  auth: { ttl: 60_000, limit: 10 },
  gameResults: { ttl: 60_000, limit: 30 },
  events: { ttl: 60_000, limit: 60 },
} as const;
