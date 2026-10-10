import { Injectable } from '@nestjs/common';
import {
  type AwardBonusBatchBody,
  type AwardBonusBody,
  type AwardBonusResponse,
  type PointEntryView,
} from '@phonics/contracts';
import { AppError } from '../../../common/errors/app-error';
import { AccessService } from '../../../core/access/access.service';
import { type Tx } from '../../../database/types';
import { AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { bonusTitle, toEntryView } from '../dto/responses/point-entry.view';
import { PointRepository } from '../repositories/point.repository';
import { type PointEntryRow } from '../types/point.types';
import { RankingService } from './ranking.service';

/** Trừ điểm cần quyền riêng (points.revoke) — kiểm tra ở service vì guard không biết dấu của points */
const revokeForbidden = () =>
  new AppError('FORBIDDEN_PERMISSION', 403, { details: { permission: ['points.revoke'] } });

/** GV / admin cộng (hoặc trừ) điểm thưởng: tạo point_entries + thông báo + tính lại hạng */
@Injectable()
export class PointBonusService {
  constructor(
    private readonly repo: PointRepository,
    private readonly ranking: RankingService,
    private readonly notifications: NotificationsService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Một học sinh trong lớp */
  async awardBonus(actor: AuthUser, classId: string, body: AwardBonusBody): Promise<AwardBonusResponse> {
    await this.access.assertClassAccess(actor, classId);
    if (body.points < 0 && actor.role !== 'ADMIN') throw revokeForbidden();
    const members = await this.repo.activeMemberIds(classId, [body.studentId]);
    if (!members.has(body.studentId)) {
      throw new AppError('NOT_FOUND', 404, { message: 'Học sinh không thuộc lớp này' });
    }

    const result = await this.repo.transaction(async (tx) => {
      const row = await this.repo.createBonus(tx, {
        studentId: body.studentId,
        classId,
        gameId: body.gameId,
        points: body.points,
        note: body.note,
        createdById: actor.id,
      });
      const actorName = await this.actorName(tx, actor);
      await this.notifications.create(
        {
          userId: body.studentId,
          type: 'BONUS_AWARDED',
          title: bonusTitle(body.points, actorName),
          body: body.note,
          data: {
            pointEntryId: row.id,
            classId,
            points: body.points,
            byUserId: actor.id,
            gameId: body.gameId ?? null,
          },
        },
        tx,
      );
      const rank = await this.ranking.recomputeAndNotify(tx, classId, body.studentId);
      return { entry: toEntryView(row), rank };
    });
    await this.audit.record(actor, 'points.bonus', 'PointEntry', result.entry.id, null, body);
    return result;
  }

  /** Nhiều học sinh một lần: một transaction, một lần tính lại hạng */
  async awardBonusBatch(
    actor: AuthUser,
    classId: string,
    body: AwardBonusBatchBody,
  ): Promise<PointEntryView[]> {
    await this.access.assertClassAccess(actor, classId);
    if (actor.role !== 'ADMIN' && body.entries.some((e) => e.points < 0)) throw revokeForbidden();
    const memberIds = await this.repo.activeMemberIds(
      classId,
      body.entries.map((e) => e.studentId),
    );
    if (body.entries.some((e) => !memberIds.has(e.studentId))) {
      throw new AppError('NOT_FOUND', 404, { message: 'Có học sinh không thuộc lớp này' });
    }

    const entries = await this.repo.transaction(async (tx) => {
      const actorName = await this.actorName(tx, actor);
      const rows: PointEntryRow[] = [];
      for (const e of body.entries) {
        rows.push(
          await this.repo.createBonus(tx, {
            studentId: e.studentId,
            classId,
            gameId: e.gameId,
            points: e.points,
            note: e.note,
            createdById: actor.id,
          }),
        );
      }
      await this.notifications.createMany(
        rows.map((row) => ({
          userId: row.studentId,
          type: 'BONUS_AWARDED' as const,
          title: bonusTitle(row.points, actorName),
          body: row.note ?? '',
          data: { pointEntryId: row.id, classId, points: row.points, byUserId: actor.id, gameId: row.gameId },
        })),
        tx,
      );
      await this.ranking.recomputeAndNotify(tx, classId);
      return rows.map(toEntryView);
    });
    await this.audit.record(actor, 'points.bonus', 'Class', classId, null, {
      count: entries.length,
      entries: body.entries,
    });
    return entries;
  }

  private async actorName(tx: Tx, actor: AuthUser): Promise<string> {
    return (await this.repo.displayName(tx, actor.id)) ?? 'your teacher';
  }
}
