import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type QuestionRow, questionInclude } from '@/modules/questions/types/question.types';
import { questionVisibleWhere } from '@/modules/questions/utils/question-content';

/** Mọi truy vấn Prisma của ngân hàng câu hỏi */
@Injectable()
export class QuestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<QuestionRow | null> {
    return this.prisma.question.findUnique({ where: { id }, include: questionInclude });
  }

  /** Câu `user` được nhìn thấy */
  findVisible(user: AuthUser, id: string): Promise<QuestionRow | null> {
    return this.prisma.question.findFirst({
      where: { AND: [{ id }, questionVisibleWhere(user)] },
      include: questionInclude,
    });
  }

  findPage(
    where: Prisma.QuestionWhereInput,
    page: { skip: number; take: number },
    orderBy: Prisma.QuestionOrderByWithRelationInput[],
  ): Promise<QuestionRow[]> {
    return this.prisma.question.findMany({ where, ...page, orderBy, include: questionInclude });
  }

  count(where: Prisma.QuestionWhereInput): Promise<number> {
    return this.prisma.question.count({ where });
  }

  /** Id trong `ids` mà `user` nhìn thấy và chưa ARCHIVED */
  async usableIds(user: AuthUser, ids: readonly string[], db: Tx = this.prisma): Promise<Set<string>> {
    const rows = await db.question.findMany({
      where: { AND: [questionVisibleWhere(user), { id: { in: [...ids] }, status: { not: 'ARCHIVED' } }] },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** Tag của các câu `user` nhìn thấy (tối đa 5000 câu) */
  async visibleTags(user: AuthUser): Promise<string[][]> {
    const rows = await this.prisma.question.findMany({
      where: questionVisibleWhere(user),
      select: { tags: true },
      take: 5000,
    });
    return rows.map((r) => r.tags);
  }

  create(data: Prisma.QuestionUncheckedCreateInput): Promise<QuestionRow> {
    return this.prisma.question.create({ data, include: questionInclude });
  }

  update(id: string, data: Prisma.QuestionUncheckedUpdateInput): Promise<QuestionRow> {
    return this.prisma.question.update({ where: { id }, data, include: questionInclude });
  }
}
