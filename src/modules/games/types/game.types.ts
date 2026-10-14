/** Dòng bảng `games` (đủ cột cho GameCatalogItem) */
export interface GameRow {
  id: string;
  title: string;
  enabled: boolean;
  comingSoon: boolean;
  price: number | null;
  sortOrder: number;
  updatedAt: Date;
}

/** Dòng `student_game_unlocks` — chỉ các cột cần cho trạng thái */
export interface UnlockRow {
  gameId: string;
  source: 'GEMS' | 'ADMIN';
  unlockedAt: Date;
  revokedAt: Date | null;
}

/** Điểm + số ván của học sinh ở một game */
export interface GameStats {
  points: number;
  rounds: number;
}

export const NO_STATS: GameStats = { points: 0, rounds: 0 };

/** Số liệu thống kê catalog cho trang quản trị (theo gameId) */
export interface GameAdminStats {
  views: Map<string, number>;
  plays: Map<string, number>;
  uniquePlayers: Map<string, number>;
  unlockedStudents: Map<string, number>;
}

/** Cổng kiểm tra trước khi ghi kết quả ván (module game-results) */
export interface GameGate {
  exists: boolean;
  enabled: boolean;
  unlocked: boolean;
}
