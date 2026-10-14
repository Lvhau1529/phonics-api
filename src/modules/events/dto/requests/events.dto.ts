import { EventBatchBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class EventBatchDto extends createZodDto(EventBatchBody) {}
