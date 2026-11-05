import { Injectable, Logger } from '@nestjs/common';
import { AssignmentRepository } from '@/modules/assignments/repositories/assignment.repository';

/** Vòng đời theo thời gian của bài giao: mở bài tới giờ, đóng bài quá hạn */
@Injectable()
export class AssignmentLifecycleService {
  private readonly logger = new Logger(AssignmentLifecycleService.name);

  constructor(private readonly repo: AssignmentRepository) {}

  /** Cron: mở bài SCHEDULED tới giờ và đóng bài OPEN quá hạn */
  async tick(now = new Date()): Promise<{ opened: number; closed: number }> {
    const due = await this.repo.findScheduledDue(now);
    let opened = 0;
    for (const { id } of due) {
      await this.repo.transaction(async (tx) => {
        if ((await this.repo.openIfScheduled(tx, id, now)) === 1) opened += 1;
      });
    }
    const closed = await this.repo.closeOverdue(now);
    if (opened || closed) this.logger.log(`Bài giao: mở ${opened}, đóng ${closed}`);
    return { opened, closed };
  }
}
