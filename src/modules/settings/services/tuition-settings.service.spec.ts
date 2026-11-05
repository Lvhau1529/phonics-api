import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { AppSettingRepository } from '@/modules/settings/repositories/app-setting.repository';
import {
  EMPTY_TUITION_SETTINGS,
  TUITION_SETTINGS_KEY,
  TuitionSettingsService,
} from '@/modules/settings/services/tuition-settings.service';
import { type PrismaService } from '@/database/prisma.service';

const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };
const updatedAt = new Date('2026-11-03T01:00:00Z');

function setup() {
  const prisma = mockDeep<PrismaService>();
  const audit = mockDeep<AuditService>();
  const service = new TuitionSettingsService(new AppSettingRepository(prisma), audit);
  return { prisma, audit, service };
}

describe('TuitionSettingsService', () => {
  it('chưa cài → mọi trường null', async () => {
    const { prisma, service } = setup();
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.get()).toEqual({ ...EMPTY_TUITION_SETTINGS, updatedAt: null });
  });

  it('đọc lỏng giá trị đã lưu: bỏ trường lạ, trường thiếu = null', async () => {
    const { prisma, service } = setup();
    prisma.appSetting.findUnique.mockResolvedValue({
      key: TUITION_SETTINGS_KEY,
      value: { orgName: 'Phonics', legacy: 1 },
      updatedById: 'a1',
      updatedAt,
    });
    const settings = await service.get();
    expect(settings).toEqual({
      ...EMPTY_TUITION_SETTINGS,
      orgName: 'Phonics',
      updatedAt: updatedAt.toISOString(),
    });
    expect(settings).not.toHaveProperty('legacy');
  });

  it('PUT thay cả bản (trường không gửi = null) và ghi audit trước / sau', async () => {
    const { prisma, audit, service } = setup();
    prisma.appSetting.findUnique.mockResolvedValue({
      key: TUITION_SETTINGS_KEY,
      value: { orgName: 'Cũ', note: 'ghi chú cũ' },
      updatedById: 'a1',
      updatedAt,
    });
    prisma.appSetting.upsert.mockResolvedValue({
      key: TUITION_SETTINGS_KEY,
      value: {},
      updatedById: 'a1',
      updatedAt,
    });

    const result = await service.update(admin, { orgName: 'Mới', dueDay: 10 });

    const value = { ...EMPTY_TUITION_SETTINGS, orgName: 'Mới', dueDay: 10 };
    expect(result).toEqual({ ...value, updatedAt: updatedAt.toISOString() });
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: TUITION_SETTINGS_KEY },
      create: { key: TUITION_SETTINGS_KEY, value, updatedById: 'a1' },
      update: { value, updatedById: 'a1' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'settings.updateTuition',
      'AppSetting',
      TUITION_SETTINGS_KEY,
      { ...EMPTY_TUITION_SETTINGS, orgName: 'Cũ', note: 'ghi chú cũ' },
      value,
    );
  });
});
