/**
 * DTO dùng chung (createZodDto từ contracts). DTO riêng của module nằm trong `<module>/dto.ts`.
 * Quy ước: class `XDto extends createZodDto(X)`; controller nhận `@Body() body: XDto` → ZodValidationPipe
 * validate theo schema; kiểu của `body` chính là `z.infer<typeof X>`.
 */
import { PageQuery, RangeQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class PageQueryDto extends createZodDto(PageQuery) {}
export class RangeQueryDto extends createZodDto(RangeQuery) {}
