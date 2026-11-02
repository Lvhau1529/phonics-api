import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { TuitionQueryDto } from '@/modules/extra-lessons/dto/requests/extra.dto';
import { TuitionService } from '@/modules/extra-lessons/services/tuition.service';

/** Thống kê học phí tổng quát (tạm tính từ điểm danh) — chỉ ADMIN */
@ApiTags('attendance')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'attendance/tuition', version: API_V1 })
export class TuitionController {
  constructor(private readonly tuition: TuitionService) {}

  @Get()
  overview(@Query() query: TuitionQueryDto) {
    return this.tuition.overview(query);
  }
}
