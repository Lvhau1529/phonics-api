import {
  ApplyToSessionsBody,
  AttendanceSessionListQuery,
  CancelAttendanceSessionsBody,
  ConfirmDigestBody,
  CreateAttendanceSessionBody,
  CreateExtraSlotBody,
  CreateSlotAssignmentBody,
  CreateSlotRateBody,
  CreateStudentRateBody,
  ExtraSlotListQuery,
  MoveSlotAssignmentBody,
  SetSlotTeachersBody,
  SlotStudentsQuery,
  StudentAttendanceQuery,
  UpdateAttendanceRecordsBody,
  UpdateExtraSlotBody,
  UpdateSlotAssignmentBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class ExtraSlotListQueryDto extends createZodDto(ExtraSlotListQuery) {}
export class CreateExtraSlotDto extends createZodDto(CreateExtraSlotBody) {}
export class UpdateExtraSlotDto extends createZodDto(UpdateExtraSlotBody) {}
export class SetSlotTeachersDto extends createZodDto(SetSlotTeachersBody) {}
export class SlotStudentsQueryDto extends createZodDto(SlotStudentsQuery) {}
export class CreateSlotRateDto extends createZodDto(CreateSlotRateBody) {}
export class CreateStudentRateDto extends createZodDto(CreateStudentRateBody) {}
export class CreateSlotAssignmentDto extends createZodDto(CreateSlotAssignmentBody) {}
export class UpdateSlotAssignmentDto extends createZodDto(UpdateSlotAssignmentBody) {}
export class MoveSlotAssignmentDto extends createZodDto(MoveSlotAssignmentBody) {}
export class AttendanceSessionListQueryDto extends createZodDto(AttendanceSessionListQuery) {}
export class UpdateAttendanceRecordsDto extends createZodDto(UpdateAttendanceRecordsBody) {}
export class CreateAttendanceSessionDto extends createZodDto(CreateAttendanceSessionBody) {}
export class CancelAttendanceSessionsDto extends createZodDto(CancelAttendanceSessionsBody) {}
export class ConfirmDigestDto extends createZodDto(ConfirmDigestBody) {}
export class ApplyToSessionsDto extends createZodDto(ApplyToSessionsBody) {}
export class StudentAttendanceQueryDto extends createZodDto(StudentAttendanceQuery) {}
