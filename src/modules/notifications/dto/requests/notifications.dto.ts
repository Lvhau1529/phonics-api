import { MarkReadBody, NotificationListQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class NotificationListQueryDto extends createZodDto(NotificationListQuery) {}
export class MarkReadDto extends createZodDto(MarkReadBody) {}
