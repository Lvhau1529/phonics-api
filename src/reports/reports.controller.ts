import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { REPORT_MIME } from '@phonics/contracts';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../common/decorators/roles.decorator';
import { ReportQueryDto } from './dto';
import { contentDisposition, type ReportFile, ReportsService } from './reports.service';

/** Xuất file xlsx / pdf (admin + giáo viên có quyền reports.export; phạm vi lớp kiểm tra trong service) */
@ApiTags('reports')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('reports.export')
@Controller('reports')
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
}

/** Nest tự đặt Content-Type / Content-Disposition / Content-Length từ options của StreamableFile */
function toStreamable(file: ReportFile): StreamableFile {
  return new StreamableFile(file.buffer, {
    type: file.mime,
    disposition: contentDisposition(file.filename),
    length: file.buffer.length,
  });
}
