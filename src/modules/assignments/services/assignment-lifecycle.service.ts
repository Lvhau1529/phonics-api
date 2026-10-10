import { Injectable, Logger } from '@nestjs/common';
import { TimeService } from '../../../core/time/time.service';
import { type Tx } from '../../../database/types';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { AssignmentRepository } from '../repositories/assignment.repository';
import { type AssignmentRow } from '../types/assignment.types';

/** Vòng đời theo thời gian của bài giao: mở bài tới giờ (+ thông báo), đóng bài quá hạn */
@Injectable()
export class AssignmentLifecycleService {
  private readonly logger = new Logger(AssignmentLifecycleService.name);

  constructor(
    private readonly repo: AssignmentRepository,
    private readonly time: TimeService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Thông báo "bài mới" cho mọi học sinh đang ở lớp (gọi trong cùng transaction với việc mở bài) */
  async notifyOpened(
    tx: Tx,
    assignment: Pick<AssignmentRow, 'id' | 'classId' | 'dueAt' | 'worksheet'>,
  ): Promise<void> {
    const studentIds = await this.repo.activeStudentIds(assignment.classId, tx);
    const due = assignment.dueAt ? ` Due ${this.time.toIsoDate(assignment.dueAt)}.` : '';
    await this.notifications.createMany(
      studentIds.map((userId) => ({
        userId,
        type: 'ASSIGNMENT_NEW' as const,
        title: 'New homework!',
        body: `${assignment.worksheet.title}.${due} Have fun!`,
        data: {
          assignmentId: assignment.id,
          worksheetTitle: assignment.worksheet.title,
          dueAt: assignment.dueAt?.toISOString() ?? null,
        },
      })),
      tx,
    );
  }

  /** Cron: mở bài SCHEDULED tới giờ (notify đúng một lần nhờ updateMany.count) và đóng bài OPEN quá hạn */
  async tick(now = new Date()): Promise<{ opened: number; closed: number }> {
    const due = await this.repo.findScheduledDue(now);
    let opened = 0;
    for (const { id } of due) {
      await this.repo.transaction(async (tx) => {
        if ((await this.repo.openIfScheduled(tx, id, now)) !== 1) return;
        await this.notifyOpened(tx, await this.repo.findByIdOrThrow(id, tx));
        opened += 1;
      });
    }
    const closed = await this.repo.closeOverdue(now);
    if (opened || closed) this.logger.log(`Bài giao: mở ${opened}, đóng ${closed}`);
    return { opened, closed };
  }
}
