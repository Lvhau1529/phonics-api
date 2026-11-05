import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  AttendanceSessionListQueryDto,
  CancelAttendanceSessionsDto,
  CreateAttendanceSessionDto,
  ResendDigestDto,
  UpdateAttendanceRecordsDto,
} from '@/modules/extra-lessons/dto/requests/extra.dto';
import { AttendanceDigestService } from '@/modules/extra-lessons/services/attendance-digest.service';
import { AttendanceReaderService } from '@/modules/extra-lessons/services/attendance-reader.service';
import { AttendanceWriterService } from '@/modules/extra-lessons/services/attendance-writer.service';

/** Buổi học thêm + điểm danh: ADMIN mọi buổi, GV buổi mình (sửa / xác nhận cần attendance.confirm) */
@ApiTags('attendance')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'attendance/sessions', version: API_V1 })
export class AttendanceController {
  constructor(
    private readonly reader: AttendanceReaderService,
    private readonly writer: AttendanceWriterService,
    private readonly digests: AttendanceDigestService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AttendanceSessionListQueryDto) {
    return this.reader.list(user, query);
  }

  @Get('pending/count')
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.reader.pendingCount(user);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.detail(user, id);
  }

  /** Buổi bù (không theo ca) */
  @RequirePermission('extra.manageSlots')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAttendanceSessionDto) {
    return this.writer.createMakeup(user, body);
  }

  /** Huỷ hàng loạt (nghỉ lễ) */
  @RequirePermission('extra.manageSlots')
  @HttpCode(200)
  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser, @Body() body: CancelAttendanceSessionsDto) {
    return this.writer.cancel(user, body);
  }

  /** Khôi phục buổi đã huỷ về chờ xác nhận */
  @RequirePermission('extra.manageSlots')
  @HttpCode(200)
  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.restore(user, id);
  }

  /** Gửi lại mail xác nhận cho GV các buổi chọn (chỉ ADMIN) */
  @Roles('ADMIN')
  @HttpCode(200)
  @Post('resend-digest')
  resendDigest(@CurrentUser() user: AuthUser, @Body() body: ResendDigestDto) {
    return this.digests.resend(user, body.sessionIds);
  }

  @RequirePermission('attendance.confirm')
  @Put(':id/records')
  updateRecords(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAttendanceRecordsDto,
  ) {
    return this.writer.updateRecords(user, id, body);
  }

  @RequirePermission('attendance.confirm')
  @HttpCode(200)
  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.confirm(user, id);
  }
}
