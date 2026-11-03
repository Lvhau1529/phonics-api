import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { UpdateTuitionSettingsDto } from '@/modules/settings/dto/requests/settings.dto';
import { TuitionSettingsService } from '@/modules/settings/services/tuition-settings.service';

/** Cài đặt hệ thống (chỉ admin) */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/settings', version: API_V1 })
export class SettingsAdminController {
  constructor(private readonly tuition: TuitionSettingsService) {}

  /** Cài đặt phiếu báo học phí (trung tâm, tài khoản nhận chuyển khoản, hạn đóng…) */
  @Get('tuition')
  tuitionSettings() {
    return this.tuition.get();
  }

  @Put('tuition')
  updateTuitionSettings(@CurrentUser() actor: AuthUser, @Body() body: UpdateTuitionSettingsDto) {
    return this.tuition.update(actor, body);
  }
}
