/**
 * @phonics/contracts — hợp đồng API dùng chung cho game, admin và api.
 * Chỉ chứa zod schema, type suy ra từ schema và hằng số thuần (không import Nest / Prisma / React).
 * Quy ước: mỗi schema `X` đi kèm `type X = z.infer<typeof X>`; body dùng `z.strictObject` (từ chối field lạ).
 */
export const CONTRACTS_VERSION = 1;

export * from './common/ids';
export * from './common/dates';
export * from './common/range';
export * from './common/pagination';
export * from './common/api-error';
export * from './users';
export * from './permissions';
export * from './auth';
export * from './classes';
export * from './students';
export * from './teachers';
export * from './games';
export * from './events';
export * from './game-results';
export * from './points';
export * from './notifications';
export * from './stats';
export * from './reports';
export * from './audit';
export * from './endpoints';
