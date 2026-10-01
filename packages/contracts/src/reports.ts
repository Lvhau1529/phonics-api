import { z } from 'zod';
import { RangeQuery } from './common/range';
import { GameId } from './games';

/** Query chung cho các endpoint xuất file (xlsx / pdf) */
export const ReportQuery = RangeQuery.extend({ gameId: GameId.optional() });
export type ReportQuery = z.infer<typeof ReportQuery>;

export const ReportFormat = z.enum(['xlsx', 'pdf']);
export type ReportFormat = z.infer<typeof ReportFormat>;

export const REPORT_MIME: Record<ReportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};
