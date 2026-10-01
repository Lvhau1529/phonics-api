import {
  SetStudentGameUnlockBody,
  UnlockClassBody,
  UnlockWithGemsBody,
  UpdateGameBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class UnlockWithGemsDto extends createZodDto(UnlockWithGemsBody) {}
export class SetStudentGameUnlockDto extends createZodDto(SetStudentGameUnlockBody) {}
export class UnlockClassDto extends createZodDto(UnlockClassBody) {}
export class UpdateGameDto extends createZodDto(UpdateGameBody) {}
