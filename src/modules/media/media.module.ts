import { Module } from '@nestjs/common';
import { DiskStorage } from '@/infrastructure/storage/disk-storage';
import { MediaCleanupService } from '@/modules/media/jobs/media-cleanup.job';
import { MediaService } from '@/modules/media/services/media.service';
import { MediaController } from '@/modules/media/controllers/media.controller';
import { MediaPublicController } from '@/modules/media/controllers/media-public.controller';

/** Ảnh / audio cho phiếu bài tập (lưu ổ đĩa VPS, upload qua link có chữ ký) — ADR 0024 */
@Module({
  controllers: [MediaController, MediaPublicController],
  providers: [DiskStorage, MediaService, MediaCleanupService],
  exports: [MediaService],
})
export class MediaModule {}
