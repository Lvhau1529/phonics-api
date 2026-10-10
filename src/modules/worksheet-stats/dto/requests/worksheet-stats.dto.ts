import { WorksheetStatsQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class WorksheetStatsQueryDto extends createZodDto(WorksheetStatsQuery) {}
