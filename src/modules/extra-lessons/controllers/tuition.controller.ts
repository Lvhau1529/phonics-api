import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { TuitionNoticeQueryDto, TuitionQueryDto } from '@/modules/extra-lessons/dto/requests/extra.dto';
import { TuitionNoticeService } from '@/modules/extra-lessons/services/tuition-notice.service';
import { TuitionService } from '@/modules/extra-lessons/services/tuition.service';

/** Thống kê học phí tổng quát (tạm tính từ điểm danh) + soạn tin nhắn thông báo học phí — chỉ ADMIN */
@ApiTags('attendance')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'attendance/tuition', version: API_V1 })
export class TuitionController {
  constructor(
    private readonly tuition: TuitionService,
    private readonly notices: TuitionNoticeService,
  ) {}

  @Get()
  overview(@Query() query: TuitionQueryDto) {
    return this.tuition.overview(query);
  }

  /** Soạn tin nhắn thông báo học phí từng phụ huynh (admin gửi tay qua Zalo) */
  @Get('notices')
  noticeList(@Query() query: TuitionNoticeQueryDto) {
    return this.notices.list(query);
  }
}
