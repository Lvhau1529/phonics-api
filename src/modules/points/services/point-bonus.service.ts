import { Injectable } from '@nestjs/common';
import {
  type AwardBonusBatchBody,
  type AwardBonusBody,
  type AwardBonusResponse,
  type PointEntryView,
} from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toEntryView } from '@/modules/points/dto/responses/point-entry.view';
import { PointRepository } from '@/modules/points/repositories/point.repository';
import { type PointEntryRow } from '@/modules/points/types/point.types';

/** Trừ điểm cần quyền riêng (points.revoke) — kiểm tra ở service vì guard không biết dấu của points */
const revokeForbidden = () =>
  new AppError('FORBIDDEN_PERMISSION', 403, { details: { permission: ['points.revoke'] } });

/** GV / admin cộng (hoặc trừ) điểm thưởng: tạo point_entries + audit */
@Injectable()
export class PointBonusService {
  constructor(
    private readonly repo: PointRepository,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Một học sinh trong lớp */
  async awardBonus(actor: AuthUser, classId: string, body: AwardBonusBody): Promise<AwardBonusResponse> {
    await this.access.assertClassAccess(actor, classId);
    if (body.points < 0 && actor.role !== 'ADMIN') throw revokeForbidden();
    const members = await this.repo.activeMemberIds(classId, [body.studentId]);
    if (!members.has(body.studentId)) {
      throw new AppError('NOT_FOUND', 404, { message: 'studentNotInClass' });
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
      return { entry: toEntryView(row) };
    });
    await this.audit.record(actor, 'points.bonus', 'PointEntry', result.entry.id, null, body);
    return result;
  }

  /** Nhiều học sinh một lần: một transaction */
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
      throw new AppError('NOT_FOUND', 404, { message: 'studentsNotInClass' });
    }

    const entries = await this.repo.transaction(async (tx) => {
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
      return rows.map(toEntryView);
    });
    await this.audit.record(actor, 'points.bonus', 'Class', classId, null, {
      count: entries.length,
      entries: body.entries,
    });
    return entries;
  }
}
