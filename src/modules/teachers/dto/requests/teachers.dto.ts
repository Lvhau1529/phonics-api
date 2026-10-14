import {
  CreateTeacherBody,
  SetTeacherClassesBody,
  TeacherListQuery,
  UpdateTeacherBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class TeacherListQueryDto extends createZodDto(TeacherListQuery) {}
export class CreateTeacherDto extends createZodDto(CreateTeacherBody) {}
export class UpdateTeacherDto extends createZodDto(UpdateTeacherBody) {}
export class SetTeacherClassesDto extends createZodDto(SetTeacherClassesBody) {}
