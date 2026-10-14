import { CompleteMediaBody, PresignMediaBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { MediaUploadQuery } from '@/modules/media/types/media.types';

export class PresignMediaDto extends createZodDto(PresignMediaBody) {}
export class CompleteMediaDto extends createZodDto(CompleteMediaBody) {}
export class MediaUploadQueryDto extends createZodDto(MediaUploadQuery) {}
