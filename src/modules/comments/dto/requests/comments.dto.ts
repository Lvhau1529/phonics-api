import { CreateCommentBody, UpdateCommentBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateCommentDto extends createZodDto(CreateCommentBody) {}
export class UpdateCommentDto extends createZodDto(UpdateCommentBody) {}
