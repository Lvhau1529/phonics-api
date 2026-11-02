import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  ApplyToSessionsDto,
  CreateSlotAssignmentDto,
  CreateStudentRateDto,
  MoveSlotAssignmentDto,
  StudentAttendanceQueryDto,
  UpdateSlotAssignmentDto,
} from '@/modules/extra-lessons/dto/requests/extra.dto';
import { AttendanceReaderService } from '@/modules/extra-lessons/services/attendance-reader.service';
import { ExtraRateService } from '@/modules/extra-lessons/services/extra-rate.service';
import { SlotAssignmentService } from '@/modules/extra-lessons/services/slot-assignment.service';
import { StudentExtraReaderService } from '@/modules/extra-lessons/services/student-extra-reader.service';

/** Học thêm của một học sinh: hồ sơ, lịch (extra.manageSchedule), giá riêng (extra.viewPricing / managePricing) */
@ApiTags('students')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'students', version: API_V1 })
export class StudentExtraController {
  constructor(
    private readonly reader: StudentExtraReaderService,
    private readonly assignments: SlotAssignmentService,
    private readonly rates: ExtraRateService,
    private readonly attendance: AttendanceReaderService,
  ) {}

  @Get(':id/extra')
  extra(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.detail(user, id);
  }

  @RequirePermission('extra.manageSchedule')
  @Post(':id/slot-assignments')
  createAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSlotAssignmentDto,
  ) {
    return this.assignments.create(user, id, body);
  }

  /** Áp lịch hiện tại vào các buổi đã xác nhận được liệt kê (`affectedSessions` của lần sửa trước) */
  @RequirePermission('extra.manageSchedule')
  @HttpCode(200)
  @Post(':id/slot-assignments/apply')
  applyAssignments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApplyToSessionsDto,
  ) {
    return this.assignments.apply(user, id, body);
  }

  @RequirePermission('extra.manageSchedule')
  @Patch(':id/slot-assignments/:assignmentId')
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: UpdateSlotAssignmentDto,
  ) {
    return this.assignments.update(user, id, assignmentId, body);
  }

  /** Xoá hẳn dòng lịch (thêm nhầm) → `{ affectedSessions }` */
  @RequirePermission('extra.manageSchedule')
  @HttpCode(200)
  @Delete(':id/slot-assignments/:assignmentId')
  deleteAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.assignments.remove(user, id, assignmentId);
  }

  /** Chuyển sang ca khác từ ngày `from` → trả dòng lịch mới */
  @RequirePermission('extra.manageSchedule')
  @Post(':id/slot-assignments/:assignmentId/move')
  moveAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: MoveSlotAssignmentDto,
  ) {
    return this.assignments.move(user, id, assignmentId, body);
  }

  @Get(':id/attendance')
  attendanceMonth(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentAttendanceQueryDto,
  ) {
    return this.attendance.studentMonth(user, id, query);
  }

  @RequirePermission('extra.viewPricing')
  @Get(':id/rates')
  studentRates(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rates.studentRates(user, id);
  }

  @RequirePermission('extra.viewPricing', 'extra.managePricing')
  @Post(':id/rates')
  createStudentRate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateStudentRateDto,
  ) {
    return this.rates.createStudentRate(user, id, body);
  }
}
