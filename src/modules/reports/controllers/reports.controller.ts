import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { REPORT_MIME } from '@phonics/contracts';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ReportQueryDto } from '@/modules/reports/dto/requests/reports.dto';
import { ReportsService } from '@/modules/reports/services/reports.service';
import { type ReportFile } from '@/modules/reports/types/report.types';
import { contentDisposition } from '@/modules/reports/utils/report-format';

/** Xuất file xlsx / pdf (admin + giáo viên có quyền reports.export; phạm vi lớp kiểm tra trong service) */
@ApiTags('reports')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('reports.export')
@Controller({ path: 'reports', version: API_V1 })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @ApiProduces(REPORT_MIME.xlsx)
  @Get('classes/:id/ranking.xlsx')
  async rankingXlsx(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: ReportQueryDto,
  ): Promise<StreamableFile> {
    return toStreamable(await this.reports.classRanking(user, classId, query, 'xlsx'));
  }

  @ApiProduces(REPORT_MIME.pdf)
  @Get('classes/:id/ranking.pdf')
  async rankingPdf(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: ReportQueryDto,
  ): Promise<StreamableFile> {
    return toStreamable(await this.reports.classRanking(user, classId, query, 'pdf'));
  }

  @ApiProduces(REPORT_MIME.xlsx)
  @Get('classes/:id/points.xlsx')
  async pointsXlsx(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) classId: string,
    @Query() query: ReportQueryDto,
  ): Promise<StreamableFile> {
    return toStreamable(await this.reports.classPoints(user, classId, query));
  }

  /** Kết quả một bài giao (phiếu bài tập): mỗi học sinh một dòng + điểm từng câu */
  @ApiProduces(REPORT_MIME.xlsx)
  @Get('assignments/:id/results.xlsx')
  async assignmentResultsXlsx(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) assignmentId: string,
  ): Promise<StreamableFile> {
    return toStreamable(await this.reports.assignmentResults(user, assignmentId));
  }
}

/** Nest tự đặt Content-Type / Content-Disposition / Content-Length từ options của StreamableFile */
function toStreamable(file: ReportFile): StreamableFile {
  return new StreamableFile(file.buffer, {
    type: file.mime,
    disposition: contentDisposition(file.filename),
    length: file.buffer.length,
  });
}
