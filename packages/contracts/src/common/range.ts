import { z } from 'zod';
import { IsoDate } from './dates.js';

/**
 * Khoảng thời gian cho điểm / xếp hạng / thống kê.
 * `range` là lối tắt theo APP_TIMEZONE của API; `from`/`to` (ngày, đoạn [from, to]) ghi đè khi có.
 */
export const RangePreset = z.enum(['all', 'today', 'week', 'month']);
export type RangePreset = z.infer<typeof RangePreset>;

export const RangeQuery = z.object({
  range: RangePreset.default('all'),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});
export type RangeQuery = z.infer<typeof RangeQuery>;
