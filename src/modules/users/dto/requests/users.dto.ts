import { UpdateProfileBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class UpdateProfileDto extends createZodDto(UpdateProfileBody) {}
