import { Module } from '@nestjs/common';
import { MediaCleanupService } from './jobs/media-cleanup.job';
import { MediaService } from './services/media.service';
import { s3ClientProvider } from '../../infrastructure/storage/storage.provider';
import { MediaController } from './controllers/media.controller';

/** Ảnh / audio cho phiếu bài tập (presigned upload lên Neon Object Storage) — ADR 0018 */
@Module({
  controllers: [MediaController],
  providers: [s3ClientProvider, MediaService, MediaCleanupService],
  exports: [MediaService],
})
export class MediaModule {}
