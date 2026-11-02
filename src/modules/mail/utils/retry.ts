import { MAIL } from '@/config/constants';

/**
 * Mốc thử lại sau lần gửi lỗi thứ `attempts` (đã tính lần vừa lỗi); null = đã hết lượt → FAILED.
 * Lần 1 lỗi chờ `backoffMs[0]`, lần 2 chờ `backoffMs[1]`…; hết mảng thì dùng phần tử cuối.
 */
export function nextRetryAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAIL.maxAttempts) return null;
  const steps = MAIL.backoffMs;
  const wait = steps[Math.min(Math.max(attempts, 1) - 1, steps.length - 1)];
  return new Date(now.getTime() + wait);
}

/** Lỗi gọn để lưu DB (một dòng, có giới hạn độ dài) */
export function errorText(err: unknown): string {
  const s = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return s.replace(/\s+/g, ' ').trim().slice(0, MAIL.maxErrorLength);
}
