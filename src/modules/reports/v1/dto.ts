import { ReportQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

/** Query chung của các endpoint xuất file: range / from / to + gameId */
export class ReportQueryDto extends createZodDto(ReportQuery) {}
