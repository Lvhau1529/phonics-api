import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WORKSHEETS } from '../../../config/constants';
import { AssignmentLifecycleService } from '../services/assignment-lifecycle.service';

/** Mỗi 5 phút: mở bài SCHEDULED tới giờ, đóng bài OPEN quá hạn (không cho nộp muộn) */
@Injectable()
export class AssignmentsScheduler {
  constructor(private readonly lifecycle: AssignmentLifecycleService) {}

  @Cron(WORKSHEETS.assignmentTickCron)
  async tick(): Promise<void> {
    await this.lifecycle.tick();
  }
}
