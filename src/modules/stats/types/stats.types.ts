import { type OverviewStats } from '@phonics/contracts';

/** Điểm GAME / BONUS theo mốc thời gian (SQL) */
export interface TimelineRow {
  bucketStart: string;
  GAME: number;
  BONUS: number;
}

/** Tổng hợp kết quả ván theo game (SQL) */
export interface GameResultAgg {
  gameId: string;
  rounds: number;
  players: number;
  correct: number;
  total: number;
}

export type OverviewCounts = Pick<OverviewStats, 'students' | 'teachers' | 'classes'>;
export type OverviewActivity = Pick<
  OverviewStats,
  'pointsLast7d' | 'roundsLast7d' | 'viewsLast7d' | 'playsLast7d' | 'activeStudentsLast7d'
>;
