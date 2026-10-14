import { z } from 'zod';
import { type Prisma } from '@/generated/prisma/client';

export type MediaRow = Prisma.MediaAssetGetPayload<object>;

/** Query của link upload do presign dựng (API tự sinh, không thuộc contracts — client dùng nguyên `uploadUrl`) */
export const MediaUploadQuery = z.object({
  exp: z.coerce.number().int(),
  sig: z.string().min(1).max(100),
});
