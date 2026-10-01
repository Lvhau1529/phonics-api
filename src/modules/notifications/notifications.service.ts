import { Injectable } from '@nestjs/common';
import {
  type MarkReadBody,
  type MarkReadResponse,
  type NotificationListQuery,
  type NotificationListResponse,
  type NotificationType,
  type NotificationView,
} from '@phonics/contracts';
import { PrismaService } from '../../core/database/prisma.service';
import { type Tx } from '../../core/database/types';
import { type Prisma } from '../../generated/prisma/client';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Thông báo trong app (không push / email). Client poll GET /me/notifications. */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NotificationInput, tx: Tx = this.prisma): Promise<void> {
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async createMany(inputs: NotificationInput[], tx: Tx = this.prisma): Promise<void> {
    if (!inputs.length) return;
    await tx.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        title: i.title,
        body: i.body,
        data: i.data as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  /**
   * RANK_CHANGED: nếu còn một thông báo đổi hạng CHƯA ĐỌC cùng lớp thì cập nhật nó (giữ `from` cũ, `to` mới)
   * thay vì tạo thêm — tránh dồn 5 thông báo khi 5 bạn cùng lớp chơi trong một phút.
   */
  async upsertRankChanged(
    tx: Tx,
    userId: string,
    change: { classId: string; className: string; from: number; to: number; members: number },
  ): Promise<void> {
    const existing = await tx.notification.findFirst({
      where: { userId, type: 'RANK_CHANGED', readAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const data = existing?.data as { classId?: string; from?: number } | null;
    const from =
      existing && data?.classId === change.classId && typeof data.from === 'number' ? data.from : change.from;
    const up = change.to < from;
    const title = up ? `You moved up to #${change.to}!` : `You are now #${change.to}`;
    const body = `${up ? 'Great job' : 'Keep playing'}! Rank #${change.to} of ${change.members} in ${change.className}.`;
    const payload = { classId: change.classId, from, to: change.to, members: change.members };

    if (existing && data?.classId === change.classId) {
      await tx.notification.update({
        where: { id: existing.id },
        data: { title, body, data: payload, createdAt: new Date() },
      });
    } else {
      await this.create({ userId, type: 'RANK_CHANGED', title, body, data: payload }, tx);
    }
  }

  async list(userId: string, query: NotificationListQuery): Promise<NotificationListResponse> {
    const where: Prisma.NotificationWhereInput = { userId, readAt: query.unread ? null : undefined };
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items: rows.map(toView), total, page: query.page, pageSize: query.pageSize, unreadCount };
  }

  async markRead(userId: string, body: MarkReadBody): Promise<MarkReadResponse> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, id: body.ids ? { in: body.ids } : undefined },
      data: { readAt: new Date() },
    });
    const unreadCount = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { updated: count, unreadCount };
  }
}

function toView(row: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: (row.data as Record<string, unknown> | null) ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
