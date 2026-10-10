import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WORKSHEETS } from '../../../config/constants';
import { PrismaService } from '../../../database/prisma.service';
import { MediaService } from '../services/media.service';

const HOUR_MS = 3600 * 1000;
const BATCH = 500;

/** Dọn media PENDING quá hạn (presign nhưng không complete): xoá đối tượng (nếu có) rồi xoá bản ghi */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  @Cron('30 4 * * *')
  async cleanup(): Promise<number> {
    const before = new Date(Date.now() - WORKSHEETS.mediaPendingTtlHours * HOUR_MS);
    const rows = await this.prisma.mediaAsset.findMany({
      where: { status: 'PENDING', createdAt: { lt: before } },
      select: { id: true, key: true },
      take: BATCH,
    });
    if (!rows.length) return 0;
    for (const row of rows) await this.media.deleteObject(row.key);
    const { count } = await this.prisma.mediaAsset.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    this.logger.log(`Đã dọn ${count} media PENDING quá ${WORKSHEETS.mediaPendingTtlHours}h`);
    return count;
  }
}
