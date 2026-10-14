/** Luật thuần của phiếu bài tập: phạm vi nhìn thấy, kiểm tra cấu trúc gửi lên, điều kiện phát hành */
import { type WorksheetStructureBody } from '@phonics/contracts';
import { sumBy } from 'es-toolkit';
import { AppError } from '@/common/errors/app-error';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type WorksheetDetailRow } from '@/modules/worksheets/types/worksheet.types';

/** GV thấy phiếu của mình ∪ phiếu SHARED đã PUBLISHED; ADMIN thấy tất cả */
export function worksheetVisibleWhere(user: AuthUser): Prisma.WorksheetWhereInput {
  if (user.role === 'ADMIN') return {};
  return { OR: [{ createdById: user.id }, { visibility: 'SHARED', status: 'PUBLISHED' }] };
}

/** Section / item có `id` phải thuộc phiếu hiện tại (không cho "mượn" id của phiếu khác) */
export function assertStructureBelongs(current: WorksheetDetailRow, body: WorksheetStructureBody): void {
  const sections = new Set(current.sections.map((s) => s.id));
  const items = new Set(current.sections.flatMap((s) => s.items.map((it) => it.id)));
  for (const s of body.sections) {
    if (s.id && !sections.has(s.id))
      throw new AppError('VALIDATION_ERROR', 400, {
        details: { sections: [`Part ${s.id} không thuộc phiếu này`] },
      });
    for (const it of s.items) {
      if (it.id && !items.has(it.id))
        throw new AppError('VALIDATION_ERROR', 400, {
          details: { items: [`Câu ${it.id} không thuộc phiếu này`] },
        });
    }
  }
}

/** Phát hành cần ≥ 1 câu và mọi câu đã PUBLISHED */
export function assertPublishable(current: WorksheetDetailRow): void {
  const items = current.sections.flatMap((s) => s.items);
  if (!items.length) throw new AppError('WORKSHEET_EMPTY', 409);
  const unpublished = [
    ...new Set(items.filter((it) => it.question.status !== 'PUBLISHED').map((it) => it.questionId)),
  ];
  if (unpublished.length)
    throw new AppError('QUESTION_NOT_PUBLISHED', 409, { details: { questionIds: unpublished } });
}

export const countItems = (row: WorksheetDetailRow): number => sumBy(row.sections, (s) => s.items.length);
