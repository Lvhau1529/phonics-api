import { z } from 'zod';

/** Khoá chính mọi bảng: UUID */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;
