import { z } from 'zod';
import { IsoDateTime } from './common/dates';
import { Id } from './common/ids';

/**
 * Id game = `manifest.id` trong apps/game/src/games/<id>/manifest.ts (không đổi sau khi phát hành).
 * Thêm game mới: thêm vào đây + GAME_REGISTRY của API (giới hạn điểm) + seed catalog.
 */
export const GameId = z.enum(['bread-catcher', 'food-stream']);
export type GameId = z.infer<typeof GameId>;
export const GAME_IDS: readonly GameId[] = GameId.options;

/** Chế độ chơi chuẩn hoá (Food Stream gọi 'classroom' → 'class') */
export const PlayMode = z.enum(['solo', 'class']);
export type PlayMode = z.infer<typeof PlayMode>;

/** Lý do kết thúc ván, chuẩn hoá giữa các game ('words' / 'questions' → 'completed') */
export const EndedBy = z.enum(['completed', 'time', 'quit']);
export type EndedBy = z.infer<typeof EndedBy>;

/** Catalog game (public): client phủ lên manifest */
export const GameCatalogItem = z.object({
  id: GameId,
  title: z.string(),
  /** false = ẩn khỏi màn chọn game (bảo trì) */
  enabled: z.boolean(),
  /** true = thẻ COMING SOON, không mở được */
  comingSoon: z.boolean(),
  /** Số kim cương để mở khoá; null = miễn phí */
  price: z.int().min(0).nullable(),
  sortOrder: z.int(),
  updatedAt: IsoDateTime,
});
export type GameCatalogItem = z.infer<typeof GameCatalogItem>;

export const PublicGamesResponse = z.object({ items: z.array(GameCatalogItem) });
export type PublicGamesResponse = z.infer<typeof PublicGamesResponse>;

/** Admin: catalog + số liệu tổng */
export const GameAdminItem = GameCatalogItem.extend({
  views: z.int().min(0),
  plays: z.int().min(0),
  uniquePlayers: z.int().min(0),
  unlockedStudents: z.int().min(0),
});
export type GameAdminItem = z.infer<typeof GameAdminItem>;

export const UpdateGameBody = z
  .strictObject({
    title: z.string().trim().min(1).max(60),
    enabled: z.boolean(),
    comingSoon: z.boolean(),
    price: z.int().min(0).max(100000).nullable(),
    sortOrder: z.int().min(0).max(1000),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Cần ít nhất một trường' });
export type UpdateGameBody = z.infer<typeof UpdateGameBody>;

export const UnlockSource = z.enum(['GEMS', 'ADMIN', 'FREE']);
export type UnlockSource = z.infer<typeof UnlockSource>;

/** Trạng thái mở khoá của một game cho một học sinh */
export const StudentGameStatus = z.object({
  gameId: GameId,
  unlocked: z.boolean(),
  source: UnlockSource.nullable(),
  unlockedAt: IsoDateTime.nullable(),
  /** Điểm học sinh đã kiếm được ở game này */
  points: z.int(),
  rounds: z.int().min(0),
});
export type StudentGameStatus = z.infer<typeof StudentGameStatus>;

export const StudentGamesResponse = z.object({ items: z.array(StudentGameStatus) });
export type StudentGamesResponse = z.infer<typeof StudentGamesResponse>;

/** Client ghi nhận học sinh đã mở khoá bằng kim cương (idempotent) */
export const UnlockWithGemsBody = z.strictObject({
  gemsSpent: z.int().min(0).max(100000),
});
export type UnlockWithGemsBody = z.infer<typeof UnlockWithGemsBody>;

/** Admin / GV có games.unlock: mở hoặc thu hồi */
export const SetStudentGameUnlockBody = z.strictObject({
  unlocked: z.boolean(),
  note: z.string().trim().max(200).optional(),
});
export type SetStudentGameUnlockBody = z.infer<typeof SetStudentGameUnlockBody>;

export const UnlockClassBody = z.strictObject({
  classId: Id,
  note: z.string().trim().max(200).optional(),
});
export type UnlockClassBody = z.infer<typeof UnlockClassBody>;

export const UnlockClassResponse = z.object({ unlocked: z.int().min(0), alreadyUnlocked: z.int().min(0) });
export type UnlockClassResponse = z.infer<typeof UnlockClassResponse>;
