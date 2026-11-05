import {
  CreateStudentsBody,
  GameResultListQuery,
  MoveClassBody,
  PointsListQuery,
  StudentListQuery,
  UpdateStudentBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class StudentListQueryDto extends createZodDto(StudentListQuery) {}
export class CreateStudentsDto extends createZodDto(CreateStudentsBody) {}
export class UpdateStudentDto extends createZodDto(UpdateStudentBody) {}
export class MoveClassDto extends createZodDto(MoveClassBody) {}
/** GET /students/:id/points — studentId lấy từ path */
export class StudentPointsQueryDto extends createZodDto(PointsListQuery.omit({ studentId: true })) {}
export class GameResultListQueryDto extends createZodDto(GameResultListQuery) {}
