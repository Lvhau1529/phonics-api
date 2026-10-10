import { CompleteMediaBody, PresignMediaBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class PresignMediaDto extends createZodDto(PresignMediaBody) {}
export class CompleteMediaDto extends createZodDto(CompleteMediaBody) {}
