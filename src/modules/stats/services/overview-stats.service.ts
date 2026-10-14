import { Injectable } from '@nestjs/common';
import { type OverviewStats } from '@phonics/contracts';
import { AccessService } from '@/core/access/access.service';
import { type DateRange } from '@/core/time/time.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { StatsRepository } from '@/modules/stats/repositories/stats.repository';
import { dayjs } from '@/core/time/dayjs';

/** GET /stats/overview — ADMIN: toàn hệ thống; TEACHER: gói trong các lớp mình dạy */
@Injectable()
export class OverviewStatsService {
  constructor(
    private readonly repo: StatsRepository,
    private readonly access: AccessService,
  ) {}

  async overview(user: AuthUser, now = new Date()): Promise<OverviewStats> {
    const range: DateRange = { from: dayjs(now).subtract(7, 'day').toDate(), to: now };
    const classIds = await this.access.scopedClassIds(user);
    const generatedAt = now.toISOString();
    if (classIds && !classIds.length) {
      return {
        students: 0,
        teachers: 0,
        classes: 0,
        pointsLast7d: 0,
        roundsLast7d: 0,
        viewsLast7d: 0,
        playsLast7d: 0,
        activeStudentsLast7d: 0,
        generatedAt,
      };
    }
    const [counts, activity] = await Promise.all([
      classIds ? this.repo.scopedCounts(classIds) : this.repo.globalCounts(),
      this.repo.activity(range, classIds),
    ]);
    return { ...counts, ...activity, generatedAt };
  }
}
