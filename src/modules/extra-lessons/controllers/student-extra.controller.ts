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
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { REPORT_MIME } from '@phonics/contracts';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { toStreamable } from '@/common/utils/streamable';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  ApplyToSessionsDto,
  CreateSlotAssignmentDto,
  CreateStudentRateDto,
  MoveSlotAssignmentDto,
  StudentAttendanceQueryDto,
  TuitionQueryDto,
  TuitionStatementQueryDto,
  UpdateSlotAssignmentDto,
} from '@/modules/extra-lessons/dto/requests/extra.dto';
import { AttendanceReaderService } from '@/modules/extra-lessons/services/attendance-reader.service';
import { ExtraRateService } from '@/modules/extra-lessons/services/extra-rate.service';
import { SlotAssignmentService } from '@/modules/extra-lessons/services/slot-assignment.service';
import { StudentExtraReaderService } from '@/modules/extra-lessons/services/student-extra-reader.service';
import { TuitionStatementService } from '@/modules/extra-lessons/services/tuition-statement.service';
import { TuitionService } from '@/modules/extra-lessons/services/tuition.service';

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
    private readonly tuitionService: TuitionService,
    private readonly statements: TuitionStatementService,
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

  /** Học phí theo tháng (tạm tính từ điểm danh) */
  @RequirePermission('extra.viewPricing')
  @Get(':id/tuition')
  tuition(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TuitionQueryDto,
  ) {
    return this.tuitionService.student(user, id, query);
  }

  /** Phiếu báo học phí một tháng (PDF) — gộp các bé cùng phụ huynh nhận học phí */
  @RequirePermission('extra.viewPricing', 'reports.export')
  @ApiProduces(REPORT_MIME.pdf)
  @Get(':id/tuition-statement.pdf')
  async tuitionStatement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TuitionStatementQueryDto,
  ): Promise<StreamableFile> {
    return toStreamable(await this.statements.pdf(user, id, query));
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
