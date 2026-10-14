import { Injectable } from '@nestjs/common';
import { type WorksheetStructureBody } from '@phonics/contracts';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import {
  type WorksheetDetailRow,
  type WorksheetSummaryRow,
  worksheetDetailInclude,
  worksheetSnapshotSelect,
  worksheetSummaryInclude,
} from '@/modules/worksheets/types/worksheet.types';
import { worksheetVisibleWhere } from '@/modules/worksheets/utils/worksheet-rules';

/** Mọi truy vấn Prisma của phiếu bài tập (worksheets, worksheet_sections, worksheet_items) */
@Injectable()
export class WorksheetRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  findPage(
    where: Prisma.WorksheetWhereInput,
    page: { skip: number; take: number },
    orderBy: Prisma.WorksheetOrderByWithRelationInput[],
  ): Promise<WorksheetSummaryRow[]> {
    return this.prisma.worksheet.findMany({ where, ...page, orderBy, include: worksheetSummaryInclude });
  }

  count(where: Prisma.WorksheetWhereInput): Promise<number> {
    return this.prisma.worksheet.count({ where });
  }

  findById(id: string, db: Tx = this.prisma): Promise<WorksheetDetailRow | null> {
    return db.worksheet.findUnique({ where: { id }, include: worksheetDetailInclude });
  }

  findVisible(user: AuthUser, id: string): Promise<WorksheetDetailRow | null> {
    return this.prisma.worksheet.findFirst({
      where: { AND: [{ id }, worksheetVisibleWhere(user)] },
      include: worksheetDetailInclude,
    });
  }

  /** Phiếu (visible) kèm nội dung đầy đủ để đóng băng khi giao bài */
  findSnapshotSource(user: AuthUser, id: string, db: Tx = this.prisma) {
    return db.worksheet.findFirst({
      where: { AND: [{ id }, worksheetVisibleWhere(user)] },
      select: worksheetSnapshotSelect,
    });
  }

  create(data: Prisma.WorksheetUncheckedCreateInput): Promise<WorksheetDetailRow> {
    return this.prisma.worksheet.create({ data, include: worksheetDetailInclude });
  }

  update(id: string, data: Prisma.WorksheetUncheckedUpdateInput): Promise<WorksheetDetailRow> {
    return this.prisma.worksheet.update({ where: { id }, data, include: worksheetDetailInclude });
  }

  /**
   * Thay toàn bộ cấu trúc trong transaction: section / item có `id` thì cập nhật (giữ id), còn lại tạo mới;
   * thứ tự = thứ tự trong payload; section / item không gửi lên bị xoá.
   */
  async replaceStructure(
    tx: Tx,
    worksheetId: string,
    body: WorksheetStructureBody,
  ): Promise<WorksheetDetailRow> {
    const keptSections: string[] = [];
    const keptItems: string[] = [];
    for (const [sIdx, s] of body.sections.entries()) {
      const sectionData = { order: sIdx, title: s.title, instruction: s.instruction ?? null };
      const sectionId = s.id
        ? (await tx.worksheetSection.update({ where: { id: s.id }, data: sectionData })).id
        : (await tx.worksheetSection.create({ data: { worksheetId, ...sectionData } })).id;
      keptSections.push(sectionId);
      for (const [iIdx, it] of s.items.entries()) {
        const data = {
          sectionId,
          order: iIdx,
          questionId: it.questionId,
          pointsOverride: it.pointsOverride ?? null,
        };
        const itemId = it.id
          ? (await tx.worksheetItem.update({ where: { id: it.id }, data })).id
          : (await tx.worksheetItem.create({ data: { worksheetId, ...data } })).id;
        keptItems.push(itemId);
      }
    }
    await tx.worksheetItem.deleteMany({ where: { worksheetId, id: { notIn: keptItems } } });
    await tx.worksheetSection.deleteMany({ where: { worksheetId, id: { notIn: keptSections } } });
    return tx.worksheet.findUniqueOrThrow({ where: { id: worksheetId }, include: worksheetDetailInclude });
  }

  /** Bản sao DRAFT (metadata + Part + câu) thuộc `ownerId`; trả id phiếu mới */
  async duplicate(tx: Tx, source: WorksheetDetailRow, ownerId: string, title: string): Promise<string> {
    const ws = await tx.worksheet.create({
      data: {
        title,
        subject: source.subject,
        topic: source.topic,
        grade: source.grade,
        week: source.week,
        day: source.day,
        kind: source.kind,
        visibility: source.visibility,
        note: source.note,
        status: 'DRAFT',
        createdById: ownerId,
      },
      select: { id: true },
    });
    for (const s of source.sections) {
      const section = await tx.worksheetSection.create({
        data: { worksheetId: ws.id, order: s.order, title: s.title, instruction: s.instruction },
        select: { id: true },
      });
      if (s.items.length) {
        await tx.worksheetItem.createMany({
          data: s.items.map((it) => ({
            worksheetId: ws.id,
            sectionId: section.id,
            order: it.order,
            questionId: it.questionId,
            pointsOverride: it.pointsOverride,
          })),
        });
      }
    }
    return ws.id;
  }
}
