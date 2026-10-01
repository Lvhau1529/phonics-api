import { Injectable, Logger } from '@nestjs/common';
import { type AuditAction, type AuditListQuery, type AuditLogView, type Paginated } from '@phonics/contracts';
import { type AuthUser } from '../auth/auth.types';
import { paginate } from '../common/pagination/paginate';
import { TimeService } from '../common/time/time.service';
import { type Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nhật ký hành động admin / giáo viên. Service nghiệp vụ gọi `record` tường minh ở các thao tác nhạy cảm
 * (đổi lớp, đổi email HS, phân quyền, cộng điểm thưởng, sửa catalog game, mở khoá).
 * Ghi log không được làm hỏng thao tác chính → nuốt lỗi và log cảnh báo.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
  ) {}

  async record(
    actor: Pick<AuthUser, 'id'> | null,
    action: AuditAction,
    targetType: string,
    targetId: string | null,
    before: unknown,
    after: unknown,
    ip?: string,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor?.id ?? null,
          action,
          targetType,
          targetId,
          before: before === undefined ? undefined : (before as Prisma.InputJsonValue),
          after: after === undefined ? undefined : (after as Prisma.InputJsonValue),
          ip,
        },
      });
    } catch (e) {
      this.logger.warn(`Không ghi được audit ${action}: ${(e as Error).message}`);
    }
  }

  async list(query: AuditListQuery): Promise<Paginated<AuditLogView>> {
    const where: Prisma.AuditLogWhereInput = {
      actorId: query.actorId,
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? this.time.fromIsoDate(query.from) : undefined,
              lt: query.to ? new Date(this.time.fromIsoDate(query.to).getTime() + 86_400_000) : undefined,
            }
          : undefined,
    };
    return paginate(
      query,
      async (args) =>
        (
          await this.prisma.auditLog.findMany({
            where,
            ...args,
            orderBy: { createdAt: 'desc' },
            include: { actor: { select: { displayName: true } } },
          })
        ).map((row) => ({
          id: row.id,
          actorId: row.actorId,
          actorName: row.actor?.displayName ?? null,
          action: row.action as AuditAction,
          targetType: row.targetType,
          targetId: row.targetId,
          before: row.before,
          after: row.after,
          createdAt: row.createdAt.toISOString(),
        })),
      () => this.prisma.auditLog.count({ where }),
    );
  }
}
