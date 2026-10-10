import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '../../../common/decorators/roles.decorator';
import { API_V1 } from '../../../config/api-version';
import { type AuthUser } from '../../auth/types/auth.types';
import { WorksheetReaderService } from '../services/worksheet-reader.service';
import { WorksheetWriterService } from '../services/worksheet-writer.service';
import {
  CreateWorksheetDto,
  UpdateWorksheetDto,
  WorksheetListQueryDto,
  WorksheetStructureDto,
} from '../dto/requests/worksheets.dto';

/** Phiếu bài tập: GV (quyền worksheets.manage) và admin */
@ApiTags('worksheets')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@RequirePermission('worksheets.manage')
@Controller({ path: 'worksheets', version: API_V1 })
export class WorksheetsController {
  constructor(
    private readonly reader: WorksheetReaderService,
    private readonly writer: WorksheetWriterService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: WorksheetListQueryDto) {
    return this.reader.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateWorksheetDto) {
    return this.writer.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateWorksheetDto,
  ) {
    return this.writer.update(user, id, body);
  }

  /** Thay toàn bộ Part + câu */
  @Put(':id/structure')
  structure(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorksheetStructureDto,
  ) {
    return this.writer.replaceStructure(user, id, body);
  }

  @HttpCode(200)
  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.publish(user, id);
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.archive(user, id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.writer.duplicate(user, id);
  }
}
