import { z } from 'zod';

/** Thời điểm trên wire luôn là ISO 8601 có múi giờ (`2026-10-01T08:30:00.000Z`) */
export const IsoDateTime = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Ngày (không giờ) theo APP_TIMEZONE: `2026-10-01` */
export const IsoDate = z.iso.date();
export type IsoDate = z.infer<typeof IsoDate>;
