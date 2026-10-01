/**
 * @phonics/contracts — hợp đồng API dùng chung cho game, admin và api.
 * Chỉ chứa zod schema, type suy ra từ schema và hằng số thuần (không import Nest / Prisma / React).
 * Quy ước: mỗi schema `X` đi kèm `type X = z.infer<typeof X>`; body dùng `z.strictObject` (từ chối field lạ).
 */
export const CONTRACTS_VERSION = 1;

export * from './common/ids.js';
export * from './common/dates.js';
export * from './common/range.js';
export * from './common/pagination.js';
export * from './common/api-error.js';
export * from './users.js';
export * from './permissions.js';
export * from './auth.js';
export * from './classes.js';
export * from './students.js';
export * from './teachers.js';
export * from './games.js';
export * from './events.js';
export * from './game-results.js';
export * from './points.js';
export * from './notifications.js';
export * from './stats.js';
export * from './reports.js';
export * from './audit.js';
export * from './endpoints.js';
