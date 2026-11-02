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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  CreateExtraSlotDto,
  CreateSlotRateDto,
  ExtraSlotListQueryDto,
  SetSlotTeachersDto,
  SlotStudentsQueryDto,
  UpdateExtraSlotDto,
} from '@/modules/extra-lessons/dto/requests/extra.dto';
import { ExtraRateService } from '@/modules/extra-lessons/services/extra-rate.service';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { ExtraSlotWriterService } from '@/modules/extra-lessons/services/extra-slot-writer.service';

/** Ca học thêm: đọc ADMIN + GV (ca mình dạy); ghi cần extra.manageSlots; giá mặc định của ca theo quyền đơn giá */
@ApiTags('extra-slots')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER')
@Controller({ path: 'extra-slots', version: API_V1 })
export class ExtraSlotsController {
  constructor(
    private readonly reader: ExtraSlotReaderService,
    private readonly writer: ExtraSlotWriterService,
    private readonly rates: ExtraRateService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ExtraSlotListQueryDto) {
    return this.reader.list(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reader.detail(user, id);
  }

  @RequirePermission('extra.manageSlots')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateExtraSlotDto) {
    return this.writer.create(user, body);
  }

  @RequirePermission('extra.manageSlots')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExtraSlotDto,
  ) {
    return this.writer.update(user, id, body);
  }

  /** Lưu trữ (không xoá): học sinh đang học kết thúc từ hôm nay */
  @RequirePermission('extra.manageSlots')
  @HttpCode(204)
  @Delete(':id')
  async archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.writer.archive(user, id);
  }

  @RequirePermission('extra.manageSlots')
  @Put(':id/teachers')
  setTeachers(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetSlotTeachersDto,
  ) {
    return this.writer.setTeachers(user, id, body);
  }

  @Get(':id/students')
  students(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: SlotStudentsQueryDto,
  ) {
    return this.reader.students(user, id, query);
  }

  @RequirePermission('extra.viewPricing')
  @Get(':id/rates')
  slotRates(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rates.slotRates(user, id);
  }

  @RequirePermission('extra.viewPricing', 'extra.managePricing')
  @Post(':id/rates')
  createSlotRate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSlotRateDto,
  ) {
    return this.rates.createSlotRate(user, id, body);
  }
}
