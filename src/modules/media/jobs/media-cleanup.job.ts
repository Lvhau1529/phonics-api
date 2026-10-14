import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WORKSHEETS } from '@/config/constants';
import { PrismaService } from '@/database/prisma.service';
import { MediaService } from '@/modules/media/services/media.service';
import { dayjs } from '@/core/time/dayjs';

const BATCH = 500;

/** Dọn media PENDING quá hạn (presign nhưng không complete): xoá đối tượng (nếu có) rồi xoá bản ghi */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  // Cùng giờ với dọn refresh token (TokenService): gom việc dọn dẹp vào một thời điểm vắng mỗi đêm
  @Cron('0 4 * * *')
  async cleanup(): Promise<number> {
    const before = dayjs().subtract(WORKSHEETS.mediaPendingTtlHours, 'hour').toDate();
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
