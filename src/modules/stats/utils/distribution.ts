/** Phân bố điểm học sinh theo khoảng — hàm thuần */
import { type DistributionBucket } from '@phonics/contracts';

/** Bước phân bố điểm theo điểm cao nhất của lớp */
export function distributionWidth(maxPoints: number): number {
  if (maxPoints <= 50) return 10;
  if (maxPoints <= 200) return 25;
  return 50;
}

/**
 * Gom điểm của học sinh vào các bucket [from, to) rộng `width`, bắt đầu từ 0.
 * Điểm âm / 0 rơi vào bucket đầu.
 */
export function distribute(points: readonly number[]): DistributionBucket[] {
  const max = points.reduce((m, p) => Math.max(m, p), 0);
  const width = distributionWidth(max);
  const buckets: DistributionBucket[] = [];
  for (let from = 0; from <= max; from += width) buckets.push({ from, to: from + width, count: 0 });
  for (const p of points) {
    const idx = Math.min(buckets.length - 1, Math.max(0, Math.floor(p / width)));
    buckets[idx].count += 1;
  }
  return buckets;
}
