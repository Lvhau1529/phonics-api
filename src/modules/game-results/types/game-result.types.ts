/** Dòng `game_results` (các cột dùng để dựng response / view) */
export interface ResultRow {
  id: string;
  studentId: string;
  classId: string | null;
  gameId: string;
  mode: string;
  levelId: string;
  packId: string | null;
  correct: number;
  total: number;
  score: number;
  durationMs: number | null;
  endedBy: string;
  playedAt: Date;
  pointsAwarded: number;
  pointsReason: string | null;
  details: unknown;
  createdAt: Date;
}
