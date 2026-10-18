import { Module } from '@nestjs/common';
import { mediaStorageProvider } from '@/infrastructure/storage/media-storage.provider';
import { MediaCleanupService } from '@/modules/media/jobs/media-cleanup.job';
import { MediaService } from '@/modules/media/services/media.service';
import { MediaController } from '@/modules/media/controllers/media.controller';
import { MediaPublicController } from '@/modules/media/controllers/media-public.controller';

/** Ảnh / audio cho phiếu bài tập (ổ đĩa VPS hoặc Cloudflare R2 theo MEDIA_STORAGE, upload qua link có chữ ký) */
@Module({
  controllers: [MediaController, MediaPublicController],
  providers: [mediaStorageProvider, MediaService, MediaCleanupService],
  exports: [MediaService],
})
export class MediaModule {}
