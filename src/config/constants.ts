import { POINT_RULES } from '@phonics/contracts';

export { POINT_RULES };

/** Giới hạn riêng từng game để chặn kết quả phi lý (thêm game mới: thêm dòng ở đây + GameId trong contracts) */
export const GAME_REGISTRY: Record<string, { maxTotal: number; maxScore: number }> = {
  'bread-catcher': { maxTotal: 60, maxScore: 60_000 },
  'food-stream': { maxTotal: 30, maxScore: 100_000 },
  // total = số từ cần để qua màn (12–15); điểm tối đa ~300 / từ + combo vần + vật phẩm
  'phonics-ocean': { maxTotal: 30, maxScore: 50_000 },
  // Câu đố / câu nói: ≤ 15 câu mỗi ván, tối đa 15 điểm / câu (chọn đúng 10 + nói 5)
  'odd-one-out': { maxTotal: 30, maxScore: 1_000 },
  'english-explorers': { maxTotal: 30, maxScore: 1_000 },
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
  /** Presign upload media (ảnh / ghi âm) */
  media: { ttl: 60_000, limit: 30 },
} as const;

/** Phiếu bài tập (ADR 0017 / 0018 / 0019) */
export const WORKSHEETS = {
  /** Media PENDING (presign nhưng không complete) bị cron xoá sau số giờ này */
  mediaPendingTtlHours: 24,
  /** Mở / đóng bài giao bị lỗi (DB tạm mất) → thử lại sau (ms); bình thường hẹn đúng mốc, không chạy định kỳ */
  assignmentRetryMs: 60_000,
  /** Thời gian làm bài tối đa tính vào durationMs */
  maxDurationMs: 6 * 3600 * 1000,
  /** Đường dẫn API phục vụ file media (ngoài `/api`): `${API_PUBLIC_URL}/files/media/<owner>/<uuid>.<ext>` */
  mediaFilesPath: '/files',
} as const;
