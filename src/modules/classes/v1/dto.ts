import {
  ClassListQuery,
  CreateClassBody,
  SetClassTeachersBody,
  StudentListQuery,
  UpdateClassBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class ClassListQueryDto extends createZodDto(ClassListQuery) {}
export class CreateClassDto extends createZodDto(CreateClassBody) {}
export class UpdateClassDto extends createZodDto(UpdateClassBody) {}
export class SetClassTeachersDto extends createZodDto(SetClassTeachersBody) {}
/** GET /classes/:id/students — như StudentListQuery nhưng classId lấy từ path */
export class ClassStudentsQueryDto extends createZodDto(StudentListQuery.omit({ classId: true })) {}
