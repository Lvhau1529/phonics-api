import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  CreateSlotAssignmentDto,
  CreateStudentRateDto,
  MoveSlotAssignmentDto,
  UpdateSlotAssignmentDto,
} from '@/modules/extra-lessons/dto/requests/extra.dto';
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
