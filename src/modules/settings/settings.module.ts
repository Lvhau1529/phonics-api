import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { SettingsAdminController } from '@/modules/settings/controllers/settings-admin.controller';
import { AppSettingRepository } from '@/modules/settings/repositories/app-setting.repository';
import { TuitionSettingsService } from '@/modules/settings/services/tuition-settings.service';

/** Cài đặt hệ thống dạng khoá → JSON (`app_settings`): hiện có cài đặt phiếu học phí */
@Module({
  imports: [AuditModule],
  controllers: [SettingsAdminController],
  providers: [AppSettingRepository, TuitionSettingsService],
  exports: [TuitionSettingsService],
})
export class SettingsModule {}
