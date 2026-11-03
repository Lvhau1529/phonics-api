import { Injectable } from '@nestjs/common';
import { TuitionSettings, type UpdateTuitionSettings } from '@phonics/contracts';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { AuditService } from '@/modules/audit/services/audit.service';
import { AppSettingRepository } from '@/modules/settings/repositories/app-setting.repository';

export const TUITION_SETTINGS_KEY = 'tuition.statement';

export type TuitionSettingsValue = Omit<TuitionSettings, 'updatedAt'>;

/** Chưa cài: mọi trường null, không in cột ca = không in lên phiếu */
export const EMPTY_TUITION_SETTINGS: TuitionSettingsValue = {
  orgName: null,
  orgAddress: null,
  orgPhone: null,
  bankBin: null,
  bankName: null,
  accountNo: null,
  accountName: null,
  transferContent: null,
  dueDay: null,
  note: null,
  showSlot: false,
};

// Đọc lỏng (không strict): giá trị lưu từ bản cũ thiếu / thừa trường vẫn dùng được
const StoredValue = TuitionSettings.omit({ updatedAt: true }).partial();

/** Cài đặt in trên phiếu báo học phí (ADMIN sửa; xuất phiếu đọc) */
@Injectable()
export class TuitionSettingsService {
  constructor(
    private readonly repo: AppSettingRepository,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<TuitionSettings> {
    const row = await this.repo.find(TUITION_SETTINGS_KEY);
    if (!row) return { ...EMPTY_TUITION_SETTINGS, updatedAt: null };
    const stored = StoredValue.safeParse(row.value);
    return { ...EMPTY_TUITION_SETTINGS, ...stored.data, updatedAt: row.updatedAt.toISOString() };
  }

  /** Thay cả bản: trường không gửi = null (không in) */
  async update(actor: AuthUser, body: UpdateTuitionSettings): Promise<TuitionSettings> {
    const { updatedAt: _u, ...before } = await this.get();
    const value: TuitionSettingsValue = { ...EMPTY_TUITION_SETTINGS, ...body };
    const row = await this.repo.upsert(TUITION_SETTINGS_KEY, value, actor.id);
    await this.audit.record(
      actor,
      'settings.updateTuition',
      'AppSetting',
      TUITION_SETTINGS_KEY,
      before,
      value,
    );
    return { ...value, updatedAt: row.updatedAt.toISOString() };
  }
}
