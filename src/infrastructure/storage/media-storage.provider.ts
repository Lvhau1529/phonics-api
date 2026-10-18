import { type Provider } from '@nestjs/common';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { DiskStorage } from '@/infrastructure/storage/disk-storage';
import { MediaStorage } from '@/infrastructure/storage/media-storage';
import { R2Storage } from '@/infrastructure/storage/r2-storage';

/** `MediaStorage` theo `MEDIA_STORAGE` (disk | r2) */
export const mediaStorageProvider: Provider = {
  provide: MediaStorage,
  inject: [ENV],
  useFactory: (env: Env): MediaStorage =>
    env.MEDIA_STORAGE === 'r2' ? new R2Storage(env) : new DiskStorage(env),
};
