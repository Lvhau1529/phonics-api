import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Prisma } from '@/generated/prisma/client';

/** Bảng `app_settings`: một dòng / khoá, giá trị JSON */
@Injectable()
export class AppSettingRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(key: string) {
    return this.prisma.appSetting.findUnique({ where: { key } });
  }

  upsert(key: string, value: Prisma.InputJsonValue, updatedById: string) {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value, updatedById },
      update: { value, updatedById },
    });
  }
}
