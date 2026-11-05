import { UpdateTuitionSettings } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class UpdateTuitionSettingsDto extends createZodDto(UpdateTuitionSettings) {}
