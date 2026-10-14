import { AuditListQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class AuditListQueryDto extends createZodDto(AuditListQuery) {}
