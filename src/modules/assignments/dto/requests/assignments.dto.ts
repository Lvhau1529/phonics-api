import {
  AssignmentListQuery,
  CreateAssignmentBody,
  MyAssignmentListQuery,
  UpdateAssignmentBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class AssignmentListQueryDto extends createZodDto(AssignmentListQuery) {}
export class CreateAssignmentDto extends createZodDto(CreateAssignmentBody) {}
export class UpdateAssignmentDto extends createZodDto(UpdateAssignmentBody) {}
export class MyAssignmentListQueryDto extends createZodDto(MyAssignmentListQuery) {}
