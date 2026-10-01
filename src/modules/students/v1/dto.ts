import {
  GameResultListQuery,
  MoveClassBody,
  PointsListQuery,
  ResetPasswordBody,
  StudentListQuery,
  UpdateStudentBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class StudentListQueryDto extends createZodDto(StudentListQuery) {}
export class UpdateStudentDto extends createZodDto(UpdateStudentBody) {}
export class MoveClassDto extends createZodDto(MoveClassBody) {}
export class ResetPasswordDto extends createZodDto(ResetPasswordBody) {}
/** GET /students/:id/points — studentId lấy từ path */
export class StudentPointsQueryDto extends createZodDto(PointsListQuery.omit({ studentId: true })) {}
export class GameResultListQueryDto extends createZodDto(GameResultListQuery) {}
